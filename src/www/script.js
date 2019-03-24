var dag = d3.sugiyama();

var HttpClient = function() {
  this.get = function(aUrl, aCallback) {
    var anHttpRequest = new XMLHttpRequest();
    anHttpRequest.onreadystatechange = function() {
      if (anHttpRequest.readyState == 4 && anHttpRequest.status == 200)
        aCallback(anHttpRequest.responseText);
    };

    anHttpRequest.open("GET", aUrl, true);
    anHttpRequest.send(null);
  };
};

var w = 950,
  h = 20;
var svg = d3.select("#graph");
// svg.attr("width", w).attr("height", h);

var client = new HttpClient();
client.get("graph.json", function(response) {
  render(svg, JSON.parse(response));
});

function render(svg, graph) {
  defs = svg.append("defs");
  stratifier = d3.dagStratify();
  // console.log("Stratifying graph");
  dag = stratifier(graph);
  console.log("Creating layout");
  layout = d3.zherebko().size([h, w]);
  // layout = d3
  //   .sugiyama()
  //   .layering(d3.layeringSimplex())
  //   .coord(d3.coordGreedy())
  //   .size([h, w]);
  // layout = d3.sugiyama()
  //   .layering(d3.layeringTopological())
  //   .coord(d3.coordTopological())
  //   .size([h,w]);
  // layout = d3.sugiyama()
  //     .layering(d3.layeringTopological())
  //     .decross(d3.decrossTwoLayer())
  //     .coord(d3.coordTopological())
  //     .size([h, w])
  layout(dag);
  console.log("Creating lines");
  line = d3
    .line()
    .curve(d3.curveMonotoneX)
    .x(d => d.y)
    .y(d => d.x);

  console.log("Creating svg");
  // svg.append("g")
  svg
    .append("g")
    .selectAll("path")
    .data(dag.links())
    .enter()
    .append("path")
    .attr("d", ({ data }) => line(data.points))
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .attr("stroke", "black");

  let nodes = svg
    .append("g")
    .selectAll("g")
    .data(dag.descendants())
    .enter()
    .append("g")
    .attr("transform", ({ x, y }) => `translate(${y}, ${x})`);

  // Plot node circles
  nodes
    .append("circle")
    .attr("r", 3)
    .attr("fill", "white")
    .attr("stroke", "black")
    .attr("stroke-width", 2)

  nodes
    .append("text")
    .text(d => d.id.substring(0,7))
    .attr("font-weight", "regular")
    .attr("class", "commit")
    .attr("font-family", "monospace")
    .attr("alignment-baseline", "middle")
    .attr("fill", "black");
}
