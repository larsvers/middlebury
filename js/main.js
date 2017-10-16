

/* Globals */
/* ------- */

var vis = vis || {};

vis.data;
vis.radiusMeasure;
vis.pack = {};
vis.dims = { radius: 2, padding: 1};
vis.dimsContext = {};
vis.svg;
vis.svgContext;
vis.scale = { colour: undefined, r: undefined, contextY: undefined, contextX: undefined };
vis.geo = {};
vis.sim;


/* Helpers */
/* ------- */

function escapeString(string) {

	return string.replace(/[^\w]/gi, '').toLowerCase();

} // escapeString()

function setColourScale(measure) {

	var domain = vis.pack.nodes.filter(function(el) {
	  return !el.children;
	}).reduce(function(a, b) {
		if (a.indexOf(b.data[measure]) < 0) a.push(b.data[measure]);
		return a;
	}, []);

	// var colScale = d3.scaleOrdinal(d3.schemeSet3).domain(domain);
	var colScale = d3.scaleOrdinal().domain(domain).range(['#0086DC', '#FF7956', '#5A9700', '#9C237D', '#E6AA00', '#532F0C', '#aaa']);



	vis.scale.colour = colScale;

} // setColourScale()

function setRadiusScale(measure) {

	var extent = d3.extent(vis.pack.nodes, function(d) { return d.data[measure]; });

	var rScale = d3.scaleSqrt().domain(extent).range([2, 5]);

	vis.scale.r = rScale;

} // setRadiusScale()

function setRadii(unitSize) {

	if (!arguments.length) { unitSize === false }

	d3.selectAll('.node')
		.transition()
			.attr('r', function(d) { 

				// save for easy pick up later at collision detection
				d.rMap = d.children ? 0 : unitSize ? vis.dims.radius : vis.scale.r(d.data[vis.radiusMeasure])
				return d.rMap;

			});

} // setRadii()


/* General */
/* ------- */

function setupVisual() {

	// Dimensions
  var container = d3.select('#vis-main').node().getBoundingClientRect();

  var margin = { top: 30 , right: 30 , bottom: 30 , left: 30 },
      width = container.width - margin.left - margin.right,
      height = container.height - margin.top - margin.bottom;

  // SVG
  var svg = d3.select('#vis-main')
    .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', '0 0 ' + container.width + ' ' + container.height)
    .append('g').attr('transform', 'translate(' + margin.left + ', ' + margin.top + ')') // to translate
    .append('g').attr('class', 'chart-g'); // to base zoom on a 0, 0 coordinate system

  // Add to global
  vis.dims.width = width;
  vis.dims.height = height;
  vis.dims.margin = margin;
  vis.svg = svg;

} // setupVisual()


/* Initial pack */
/* ------------ */

function getPack(data) {

	vis.pack.layout = d3.pack()
			.size([vis.dims.width - vis.dims.margin.left, vis.dims.height - vis.dims.margin.top])
			.padding(2)

} // getPack()

function layoutPackData(data, measure) {

	// layout data
  var root = d3.hierarchy(data)
	    .sum(function(d) { return d[measure]; })
	    .sort(function(a, b) { return b.value - a.value; });

	var nodes = vis.pack.layout(root).descendants();

	// Add unique id to each datapoint for circle pack key function
	nodes.forEach(function(el) { el.id = el.children ? el.data.name : el.data.id; })

  vis.pack.root = root;
  vis.pack.nodes = nodes;

} // layoutPackData()

function drawPack(data) {

	var circles = vis.svg.append('g').attr('id', 'nodes-g')
			.selectAll('.node')
			.data(data, function(d) { return d.id; });

	circles.enter().append('circle')
		.merge(circles)
			.attr('class', function(d) { return d.parent ? d.children ? 'node' : 'node node-leaf' : 'node node-root'})
			.style('fill', function(d) { return d.parent ? d.children ? '#e7e7e7' : vis.scale.colour(d.data.school) : '#f3f3f3'; })
			.attr('transform', function(d) { 
				d.xPack = d.x; // augment data with pack positions...
				d.yPack = d.y;
				return 'translate(' + d.x + ', ' + d.y + ')'; 
			})
		.transition().ease(d3.easeElastic).duration(1500).delay(function(d,i) { return i * 20; })
			.attr('r', function(d) { return d.r; });

	circles.exit().transition().attr('r', 0).remove()

} // drawPack()


/* Map */
/* --- */

function prepGeoData(world) {

  var countries = topojson.feature(world, world.objects.ne_110m_admin_0_countries); // Convert TopoJSON to GeoJSON array of countries

  countries.features.sort(function(a, b) { return d3.ascending(a.properties.admin, b.properties.admin) }); // Sort for quicker search

  vis.geo.countries = countries;

} // prepGeoData()

function setupMap(geo) {

	// Projection and path generator
	var projection = d3.geoRobinson()
	    .fitExtent([[vis.dims.margin.left, vis.dims.margin.top], [vis.dims.width, vis.dims.height]], vis.geo.countries);

	var path = d3.geoPath()
	    .projection(projection);

	vis.geo.projection = projection;
	vis.geo.path = path;

} // setupMap()

function drawMap(data) {

	vis.svg.insert('g', ':first-child').attr('id', 'map-g')
		.append('path')
		.datum(data)
		.attr('d', vis.geo.path)
		.attr('stroke-width', 1)
		.attr('stroke', '#ccc')
		.attr('fill-opacity', 0);

} // drawMap()


function initMapSimulation(nodes) {

  vis.sim = d3.forceSimulation(nodes)
  		.velocityDecay(0.2)
      .force('xPos', d3.forceX(function(d) { d.xGeo = vis.geo.projection([d.data.lng, d.data.lat])[0]; return d.xGeo }).strength(0.1)) // also augment map positions as xGeo and yGeo...
      .force('yPos', d3.forceY(function(d) { d.yGeo = vis.geo.projection([d.data.lng, d.data.lat])[1]; return d.yGeo; }).strength(0.1))
      .force('collide', d3.forceCollide().radius(function(d) { return d.rMap + vis.dims.padding }))
    	.on('tick', tick);

  leaves = d3.selectAll('.node-leaf'); // save re-selection time in tick() TODO global

  function tick() {

    leaves.attr('transform', function(d) { return 'translate(' + d.x + ', ' + d.y + ')'; } );

  } // tick()

} // initMapSimulation()

function mapSimulation() {
	
	// corce x to positions prior to map simulation === pack positions
	leaves.data().forEach(function(el) {
    el.x = el.xPack;
    el.y = el.yPack;
	});

	vis.sim.stop();

  vis.sim
      .force('xPos', d3.forceX(function(d) { return d.xGeo }).strength(0.1))
      .force('yPos', d3.forceY(function(d) { return d.yGeo; }).strength(0.1))

  vis.sim.alpha(0.5).restart()

} // mapSimulation()


/* Context */
/* ------- */

function setupContext() {

	// Dimensions
  var container = d3.select('#vis-context').node().getBoundingClientRect();

  var margin = { top: 20 , right: 30 , bottom: 20 , left: 50 },
      width = container.width - margin.left - margin.right,
      height = container.height - margin.top - margin.bottom;

  // SVG
  var svg = d3.select('#vis-context')
    .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', '0 0 ' + container.width + ' ' + container.height)
    .append('g').attr('transform', 'translate(' + margin.left + ', ' + margin.top + ')') // to translate
    .append('g').attr('class', 'context-chart-g'); // to base zoom on a 0, 0 coordinate system

  // Add to global
  vis.dimsContext.width = width;
  vis.dimsContext.height = height;
  vis.dimsContext.margin = margin;
  vis.svgContext = svg;

} // setupContext()

function initContextScales() {

	// Only leaf nodes
	var data = vis.pack.nodes.filter(function(el) { return !el.children; });

	// y Extent
	var yExtent = d3.extent(data, function(d) { return d.data.participating; });

	// y Scale
	var yScale = d3.scaleLinear().domain(yExtent).range([vis.dimsContext.height, 0]);

	// x Extent (unique entries of x measure)
	var xDomain = data.reduce(function(a, b) {
		if (a.indexOf(b.data.unit_long) < 0) a.push(b.data.unit_long);
		return a;
	}, []);

	// x Scale
	var xScale = d3.scaleBand().domain(xDomain).range([0, vis.dimsContext.width]).padding(0.2);

	// Globals
	vis.scale.contextY = yScale;
	vis.scale.contextX = xScale;

} // initContextScales()


function initContextAxes() {

	// Components
	var xAxis = d3.axisBottom(vis.scale.contextX).tickSizeOuter(0);
	var yAxis = d3.axisLeft(vis.scale.contextY).tickSizeOuter(0);

	// Draw
	vis.svgContext.append('g')
			.attr('class', 'x axis')
			.attr('transform', 'translate(' + 0 + ', ' + vis.dimsContext.height + ')')
			.call(xAxis);

	vis.svgContext.append('g')
			.attr('class', 'y axis')
			.attr('transform', 'translate(' + 0 + ', ' + 0 + ')')
			.call(yAxis);

	d3.selectAll('.y.tick text').attr('transform', 'rotate(-35)')

} // initContextAxes()


function initBarG() {

	vis.svgContext.append('g').attr('id', 'bar-g')

} // initBarG()


function drawContext(data, measure) {

	var newData = data
		.filter(function(el) { return !el.children; })
		.sort(function(a, b) {
			return d3.descending(a.data[measure], b.data[measure])
		});


	vis.scale.contextX.domain(newData.map(function(el) { return el.data.unit_long; }));

	var bar = d3.select('#bar-g').selectAll('.bar')
		.data(newData, function(d) { return d.id; });

	var barEnter = bar.enter().append('rect')
		.merge(bar)
			.attr('class', 'bar')
			.attr('id', function(d) { return escapeString(d.data.unit_long); })
			.attr('x', function(d) { return vis.scale.contextX(d.data.unit_long); })
			.attr('y', function(d) { return vis.scale.contextY(d.data[measure]); })
			.attr('width', vis.scale.contextX.bandwidth())
			.attr('height', function(d) { return vis.scale.contextY(0) - vis.scale.contextY(d.data[measure]); })
			.attr('rx', 1)
			.attr('ry', 1)
			.style('fill', function(d) { return vis.scale.colour(d.data.school); });

	bar.exit().style('opacity', 0).remove();

} // drawContext()

/* Handler */
/* ------- */

function positionMap() {

	// Only leave nodes
	var nodes = vis.pack.nodes.filter(function(el) { return !el.children; });

	// shrink circles
	setRadii(false);

	// Move to map
	!vis.sim ? initMapSimulation(nodes) : mapSimulation();

} // positionMap()

function positionPack() {

	vis.sim.stop();

	d3.selectAll('.node')
		.transition().duration(1000)
			.attr('r', function(d) { return d.r; })
			.attr('transform', function(d) { return 'translate(' + d.xPack + ', ' + d.yPack + ')'});

} // positionPack



function ready(error, data, world) {
	if (error) throw error;

	console.log({data, world});

	vis.data = data;

	setupVisual();

	/* Initial pack */
	/* ------------ */

	getPack(vis.data);

	vis.radiusMeasure = 'participating';

	layoutPackData(vis.data, vis.radiusMeasure);

	setColourScale('school');

	drawPack(vis.pack.nodes);

	console.log(vis.pack);

	/* Map */
	/* --- */

	prepGeoData(world);

	setupMap(vis.geo.countries);

	setRadiusScale(vis.radiusMeasure);

	drawMap(vis.geo.countries);

	/* Context */
	/* ------- */

	setupContext();

	initContextScales();

	initContextAxes();

	initBarG();

	drawContext(vis.pack.nodes, 'participating')



d3.select('#one').on('mousedown', positionMap); 
d3.select('#two').on('mousedown', positionPack); 




} // ready()



	// // Only leaf nodes
	// var data = vis.pack.nodes.filter(function(el) { return !el.children; });

	// 	// Extents
	// var partExt = d3.extent(data, function(d) { return d.participating; });
	// var operExt = d3.extent(data, function(d) { return d.operating_weeks; });
	// var yearExt = d3.extent(data, function(d) { return moment(d.year_began); });







d3.queue()
		.defer(d3.json, '../data/nested-data.json')
		.defer(d3.json, '../data/world-110m.json')
		.await(ready);