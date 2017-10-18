

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
vis.axis =  { contextX: undefined, contextY: undefined };
vis.colourMap = [
	{ school: "Bread Loaf School of English", colour: "#8EA9E8" },
	{ school: "Bread Loaf Writers' Conference", colour: "#485A8C" },
	{ school: "C.V. Starr Schools Abroad", colour: "#79C9F6" },
	{ school: "Middlebury College", colour: "#F6C280" },
	{ school: "Middlebury IIS", colour: "#DED93B" },
	{ school: "Middlebury Language Schools", colour: "#DB8721" },
	{ school: "Middlebury School of the Env.", colour: "#AD74ED" }
];



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


function showMap(show) {

  if (show) {
    d3.select('#map-g').transition().duration(500).style('opacity', 1);
  } else {
    d3.select('#map-g').transition().duration(500).style('opacity', 0);
  }

} // showMap()

function highlightButton(parentId, selection) {

  d3.selectAll('#' + parentId + ' button').classed('highlight-button', false);
  selection.classed('highlight-button', true);

} // highlightButton()

function hideGeoNullNodes(hide, selection) {

	if (hide) {
		selection.filter(function(d) { return d.data.lng === null; }).transition().style('opacity', 0).style('pointer-events', 'none');
	} else {
		selection.filter(function(d) { return d.data.lng === null; }).transition().style('opacity', 0).style('pointer-events', 'all');
	}

}

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
      .attr('id', 'main-svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', '0 0 ' + container.width + ' ' + container.height)
    .append('g').attr('transform', 'translate(' + margin.left + ', ' + margin.top + ')') // to translate
    .append('g').attr('id', 'chart-g'); // to base zoom on a 0, 0 coordinate system

  // Set up zoom surface
  var zoomSurface = d3.select('svg#main-svg').append('rect')
  		.attr('id', 'zoom-surface')
  		.attr('width', container.width)
  		.attr('height', container.height)
  		.style('opacity', 0)


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
			.attr('class', function(d) { return d.parent ? d.children ? 'node' : 'node node-leaf' : 'node node-root'; })
			.attr('id', function(d) { return d.data.id; })
			.style('fill', function(d) { return d.children ? '#293e5a' : d.data.colour; })
			.style('fill-opacity', function(d) { return d.parent ? d.children ? 0.9 : 1 : 0.4; })
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

	vis.svg.insert('g', '#nodes-g').attr('id', 'map-g')
		.append('path')
		.datum(data)
		.attr('d', vis.geo.path);

	d3.select('#map-g').style('opacity', 0);

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

  var margin = { top: 100 , right: 30 , bottom: 30 , left: 50 },
      width = container.width - margin.left - margin.right,
      height = container.height - margin.top - margin.bottom;

  // SVG
  var svg = d3.select('#vis-context')
    .append('svg')
      .attr('id', 'context-svg')
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
	// var yScale = d3.scaleLinear().domain(yExtent).range([vis.dimsContext.height, 0]);
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
	vis.axis.contextX = d3.axisBottom(vis.scale.contextX).tickSizeOuter(0);
	vis.axis.contextY = d3.axisLeft(vis.scale.contextY).tickSizeOuter(0).tickSize(-vis.dimsContext.width);

	// Draw
	vis.svgContext.append('g')
			.attr('class', 'x axis')
			.attr('transform', 'translate(' + 0 + ', ' + vis.dimsContext.height + ')')
			.call(vis.axis.contextX);

	vis.svgContext.append('g')
			.attr('class', 'y axis')
			.attr('transform', 'translate(' + 0 + ', ' + 0 + ')')
			.call(vis.axis.contextY);

	d3.selectAll('.y.tick text').attr('transform', 'rotate(-35)')

} // initContextAxes()


function initBarG() {

	vis.svgContext.append('g').attr('id', 'bar-g')

} // initBarG()


function prepContextData() {

	var data,
			yMeasure,
			sortBy;

	function my() {

		// get new data
		var newData = data
			.filter(function(el) { return !el.children; })
			.sort(function(a, b) {
				return d3.descending(a.data[sortBy], b.data[sortBy]) || d3.descending(a.data[yMeasure], b.data[yMeasure]); // http://bit.ly/2ysKXb6
			});

		// set x scale
		vis.scale.contextX.domain(newData.map(function(el) { return el.data.unit_long; }));

		// set y extent
		var yMax = d3.max(newData, function(d) { return d.data[yMeasure] });

		// set y scale
		vis.scale.contextY.domain([0, yMax]);

		return newData;

	} // my()

	my.data = function(_) {
		if (!arguments.length) return data;
		data = _;
		return my;
	};

	my.yMeasure = function(_) {
		if (!arguments.length) return yMeasure;
		yMeasure = _;
		return my;
	};

	my.sortBy = function(_) {
		if (!arguments.length) return sortBy;
		sortBy = _;
		return my;
	};

	return my;

} // prepContextData()

function drawContext(data, measure) {

	// update scales and axes
	vis.axis.contextX.scale(vis.scale.contextX);
	vis.axis.contextY.scale(vis.scale.contextY);

	d3.select('.x.axis').transition().call(vis.axis.contextX);
	d3.select('.y.axis').transition().call(vis.axis.contextY);

	// update the bars
	var bar = d3.select('#bar-g').selectAll('.bar')
		.data(data, function(d) { return d.id; });

	// enter the bars (note: no merge)
	var barEnter = bar.enter().append('rect')
			.attr('class', 'bar')
			.attr('id', function(d) { return d.data.id; })
			.attr('x', function(d) { return vis.scale.contextX(d.data.unit_long); })
			.attr('width', vis.scale.contextX.bandwidth())
			.attr('rx', 1)
			.attr('ry', 1)
			.style('fill', function(d) { return d.data.colour; })
			.attr('y', function(d) { return vis.scale.contextY(0); })
			.attr('height', function(d) {  return vis.scale.contextY(0) - vis.scale.contextY(0) })
		.transition().duration(1000)
			.attr('y', function(d) { return vis.scale.contextY(d.data[measure]); })
			.attr('height', function(d) { return vis.scale.contextY(0) - vis.scale.contextY(d.data[measure]); });

	// update transition
	bar.transition().duration(1000).delay(function(d, i) { return i * 10; })
			.attr('y', function(d) { return vis.scale.contextY(d.data[measure]); })
			.attr('height', function(d) { return vis.scale.contextY(0) - vis.scale.contextY(d.data[measure]); })
			.attr('x', function(d) { return vis.scale.contextX(d.data.unit_long); })

	// exit
	bar.exit().style('opacity', 0).remove();

} // drawContext()


function configLegend() {


	var legend = buildLegend()
			.dims(vis.dimsContext)
			.data(vis.colourMap);
	
	vis.svgContext.call(legend);

} // configLegend()

function buildLegend() {

	var dims,
			data;

	function my(selection) {

		/* Draw legend */
		/* ----------- */

		// Add g element
		var gLegend = selection.insert('g', ':first-child')
				.attr('id', 'legend-g');

		// g per school
		var legendGroup = gLegend.selectAll('.legend-group')
			.data(data)
			.enter().append('g')
				.attr('class', 'legend-group');

		// add circle and text
		legendGroup.append('circle')
				.attr('r', 5)
				.style('fill', function(d) { return d.colour; });

		legendGroup.append('text')
				.attr('text-anchor', 'start')
				.attr('dx', '0.75em')
				.attr('dy', '0.35em')
				.text(function(d) { return d.school; })
				.style('font-size', '0.55vw') // make text size responsive
				.style('fill', '#6b788e');


		/* Position legend */
		/* --------------- */

		var groupWidths,
				groupWidthsCum,
				sum,
				padding = 5;

		// Each group's width
		var groupWidths = [0]	
		legendGroup.each(function(el) { groupWidths.push(this.getBBox().width + padding); });

		// Cumulate widths to find positions
		var groupWidthsCum = [];
		groupWidths.reduce(function(prev, next, i) { return groupWidthsCum[i] = prev + next; }, 0);
		groupWidthsCum.pop(); // remove last value - not needed

		// Translate each group to its rightful position
		legendGroup.each(function(el, i) { d3.select(this).attr('transform', 'translate(' + Math.floor(groupWidthsCum[i]) + ', 0)'); });

		// Calculate x start of legend
		gLegend.attr('transform', 'translate(' + (dims.width/2 - d3.sum(groupWidths)/2) + ', ' + -dims.margin.top/2 + ')')





		// position markers


	} // my()

	my.dims = function(_) {
		if (!arguments.length) return dims;
		dims = _; 
		return my;
	};

	my.data = function(_) {
		if (!arguments.length) return data;
		data = _; 
		return my;
	};

	return my;

} // buildLegend()


/* Initial sequence on load */
/* ------------------------ */

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

	highlightButton('controls', d3.select('#btn-pack'));

	console.log(vis.pack);

	/* Map */
	/* --- */

	prepGeoData(world);

	setupMap(vis.geo.countries);

	setRadiusScale(vis.radiusMeasure);

	drawMap(vis.geo.countries);

	/* Initial context */
	/* --------------- */

	setupContext();

	initContextScales();

	initContextAxes();

	initBarG();

	// prep data
	var dataPrepConfig = prepContextData()
			.data(vis.pack.nodes)
			.yMeasure('participating')
			.sortBy('participating');

	var newData = dataPrepConfig();

	// draw it
	drawContext(newData, 'participating');

	highlightButton('vis-context-controls', d3.select('#btn-students'));



	/* Legend */
	/* ------ */

	configLegend();






	/* Listener */
	/* -------- */

	// Main visual listeners
	d3.select('#btn-map').on('mousedown', positionMap); 
	d3.select('#btn-pack').on('mousedown', positionPack); 
	
	// Context visual listeners
	d3.select('#btn-students').on('mousedown', students)
	d3.select('#btn-students-by-school').on('mousedown', studentsBySchool)
	d3.select('#btn-oper').on('mousedown', weeks)
	d3.select('#btn-oper-by-school').on('mousedown', weeksBySchool)


	/* Zoom */
	/* ---- */

	var zoom = d3.zoom().scaleExtent([0.66, 2.8]).on('zoom', zoomed);

	d3.select('#zoom-surface').call(zoom);



} // ready()





/* Handler */
/* ------- */

/* -- Main visual -- */

function positionMap() {

	// highlight button
	highlightButton('controls', d3.select('#btn-map'));

	// Only leave nodes
	var nodes = vis.pack.nodes.filter(function(el) { return !el.children; });

	// shrink circles
	setRadii(false);

	// show map
	showMap(true)

	// Move to map
	!vis.sim ? initMapSimulation(nodes) : mapSimulation();

	// hide geo === null bubbles
	hideGeoNullNodes(true, d3.selectAll('.node'));


} // positionMap()

function positionPack() {

	// highlight button
	highlightButton('controls', d3.select('#btn-pack'));

	// show geo === null bubbles
	hideGeoNullNodes(false, d3.selectAll('.node'));

	// hide map
	showMap(false)

	vis.sim.stop();

	d3.selectAll('.node')
		.transition().duration(1000)
			.attr('r', function(d) { return d.r; })
			.attr('transform', function(d) { return 'translate(' + d.xPack + ', ' + d.yPack + ')'});

} // positionPack


/* -- Context visual -- */

function students() {

	highlightButton('vis-context-controls', d3.select('#btn-students'));

	var dataPrepConfig = prepContextData()
			.data(vis.pack.nodes)
			.yMeasure('participating')
			.sortBy('participating');

	var newData = dataPrepConfig();

	drawContext(newData, 'participating');

} // students()

function studentsBySchool() {

	highlightButton('vis-context-controls', d3.select('#btn-students-by-school'));

	var dataPrepConfig = prepContextData()
			.data(vis.pack.nodes)
			.yMeasure('participating')
			.sortBy('school');

	var newData = dataPrepConfig();

	drawContext(newData, 'participating');

} // studentsBySchool()

function weeks() {

	highlightButton('vis-context-controls', d3.select('#btn-oper'));

	var dataPrepConfig = prepContextData()
			.data(vis.pack.nodes)
			.yMeasure('operating_weeks')
			.sortBy('operating_weeks');

	var newData = dataPrepConfig();

	drawContext(newData, 'operating_weeks');

} // weeks()

function weeksBySchool() {

	highlightButton('vis-context-controls', d3.select('#btn-oper-by-school'));

	var dataPrepConfig = prepContextData()
			.data(vis.pack.nodes)
			.yMeasure('operating_weeks')
			.sortBy('school');

	var newData = dataPrepConfig();

	drawContext(newData, 'operating_weeks');

} // weeksBySchool()


/* -- Zoom -- */

function zoomed() {

	var transform = d3.event.transform;

	d3.select('g#chart-g').attr('transform', transform.toString());

} // zoom()



/* Load data */
/* --------- */

d3.queue()
		.defer(d3.json, '../data/nested-data.json')
		.defer(d3.json, '../data/world-110m.json')
		.await(ready);