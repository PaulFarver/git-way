function removePrefix(branch) {
  if (branch.startsWith("origin/")) {
    branch = branch.substr(7);
  }
  if (branch.startsWith("hotfix/")) {
    branch = branch.substr(7);
  }
  if (branch.startsWith("feature/")) {
    branch = branch.substr(8);
  }
  if (branch.startsWith("release/")) {
    branch = branch.substr(8);
  }
  return branch;
}

function elapsed(timestamp) {
  now = Date.now() / 1000;
  let seconds = Math.floor(now - timestamp);
  switch(true){
    case seconds > 1209600:
      return `${Math.floor(seconds / 604800)} weeks ago`
    case seconds > 172800:
      return `${Math.floor(seconds / 86400)} days ago`
    case seconds > 7200:
      return `${Math.floor(seconds / 3600)} hours ago`
    case seconds > 120:
      return `${Math.floor(seconds / 60)} minutes ago`
    default:
      return "just now"
  }
}

function pullfunction() {
  d3.json("/api/graph" + window.location.search).then(render)
};

function render(graph) {
  let svg = d3.select("#graph");

  let width = 1800;
  let padding = 0;

  let diff = 60;
  let y = generateY(diff);
  let x = generateX(width, graph.mintime, graph.maxtime);

  graph.branches.forEach(branch => {
    y(branch.name);
  });

  drawlanes(svg.select("#swimlanes"), graph.branches, width, diff, y);

  let height = y("final") - diff / 2;
  svg.attr(
    "viewBox",
    `-${padding} -${padding} ${width + padding * 2} ${height + padding * 2}`
  );

  drawlines(svg.select("#lines"), graph.links, graph.nodes, x, y);

  drawnodes(svg.select("#commits"), graph.nodes, graph.relevants, x, y);
}

function generateY(diff) {
  let branchYs = {};
  let curry = diff / 2;
  return branch => {
    if (branchYs[branch] == null) {
      branchYs[branch] = curry;
      curry += diff;
    }
    return branchYs[branch];
  };
}

function generateX(width, min, max) {
  xfactor = (width - 200) / (max - min);
  return timestamp => (timestamp - min) * xfactor;
}

function drawlanes(svg, branches, width, diff, y) {
  let ydiff = diff - 6;
  let lanes = svg
    .selectAll(".branchlane")
    .data(branches, b => b.name + b.lastcommit);
  lanes.exit().remove();

  let t = b => `translate(0, ${y(b.name) - diff / 2})`;

  g = lanes
    .enter()
    .append("g")
    .attr("class", "branchlane")
    .attr("transform", t);
  g.append("rect")
    .attr("width", width)
    .attr("height", diff)
    .attr("class", "swimlane")
    .attr("priority", branch => branch.priority);
  labels = g
    .append("foreignObject")
    .attr("x", width - 200)
    .attr("y", 3)
    .attr("height", ydiff)
    .attr("width", 200)
    .append("xhtml:body");
  labels
    .append("p")
    .attr("class", "branchlabel branchname")
    .text(b => removePrefix(b.name));
  labels
    .append("p")
    .attr("class", "branchlabel branchauthor")
    .text(b => b.lastcommitter);
  labels
    .append("p")
    .attr("class", "branchlabel branchtime")
    .text(b => elapsed(b.lastcommit));

  transitions = lanes.transition();
  transitions.attr("transform", t);
  transitions
    .selectAll("foreignObject body p.branchlabel.branchauthor")
    .text(d => d.lastcommitter);
  transitions
    .selectAll("foreignObject body p.branchlabel.branchtime")
    .text(d => elapsed(d.lastcommit));
}

function drawlines(svg, links, nodes, x, y) {
  let lines = svg
    .selectAll(".commitline")
    .data(links, link => link.source + link.target);

  lines.exit().remove();

  lines
    .enter()
    .append("line")
    .attr("class", "commitline")
    .attr("x1", l => x(nodes[l.source].timestamp))
    .attr("x2", l => x(nodes[l.target].timestamp))
    .attr("y1", l => y(nodes[l.source].branch))
    .attr("y2", l => y(nodes[l.target].branch))
    .attr("prehistoric", l => nodes[l.target].timestamp == 0);

  lines
    .transition()
    .attr("x1", l => x(nodes[l.source].timestamp))
    .attr("x2", l => x(nodes[l.target].timestamp))
    .attr("y1", l => y(nodes[l.source].branch))
    .attr("y2", l => y(nodes[l.target].branch))
    .attr("prehistoric", l => nodes[l.target].timestamp == 0);
}

function drawnodes(svg, nodes, relevants, x, y) {
  let selects = svg
    .selectAll(".commitobject")
    .data(Object.keys(relevants), d => d);
  selects.exit().remove();

  let t = n => `translate(${x(nodes[n].timestamp)}, ${y(nodes[n].branch)})`;
  let r = n => (relevants[n] ? 6 : 0);
  let i = n => (relevants[n] ? true : false);

  selects
    .enter()
    .append("g")
    .attr("class", "commitobject")
    .attr("transform", t)
    .append("svg:circle")
    .attr("class", "commitnode")
    .attr("r", r)
    .attr("important", i);

  selects
    .transition()
    .attr("transform", t)
    .select(".commitnode")
    .attr("r", r)
    .attr("important", i);
}

pullfunction();
setInterval(pullfunction, 10000);
