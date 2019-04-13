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
  let weeks = Math.floor(seconds / 604800);
  if (weeks >= 2) {
    return weeks + " weeks ago";
  }
  let days = Math.floor(seconds / 86400);
  if (days >= 2) {
    return days + " days ago";
  }
  let hours = Math.floor(seconds / 3600);
  if (hours >= 2) {
    return hours + " hours ago";
  }
  let minutes = Math.floor(seconds / 60);
  if (minutes >= 2) {
    return minutes + " minutes ago";
  }
  return "Just now";
}

pullfunction = function() {
  var client = new HttpClient();
  client.get("/api/graph?" + window.location.search.substring(1), function(
    response
  ) {
    let a = performance.now();
    render(JSON.parse(response));
    let b = performance.now();
    console.log(`Graph rendered in ${Math.round((b - a) * 10) / 10} ms`);
  });
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
  let swimlanes = svg.selectAll(".branchlane").data(branches, b => b.name);
  swimlanes.exit().remove();
  g = swimlanes
    .enter()
    .append("g")
    .attr("class", "branchlane")
    .attr("transform", b => `translate(0, ${y(b.name) - diff / 2})`);
  g.append("rect")
    .attr("width", width)
    .attr("height", diff)
    .attr("class", "swimlane")
    .attr("priority", branch => branch.priority);
  g.append("foreignObject")
    .attr("x", width - 200)
    .attr("y", 0)
    .attr("width", 200)
    .attr("height", ydiff / 3)
    .append("xhtml:body")
    .attr("class", "branchlabel branchname")
    .style("line-height", ydiff / 3 + "px")
    .text(b => removePrefix(b.name));
  g.append("foreignObject")
    .attr("x", width - 200)
    .attr("y", ydiff / 3)
    .attr("width", 200)
    .attr("height", ydiff / 3)
    .append("xhtml:body")
    .attr("class", "branchlabel branchauthor")
    .style("line-height", ydiff / 3 + "px")
    .text(b => b.lastcommitter);
  g.append("foreignObject")
    .attr("x", width - 200)
    .attr("y", (ydiff * 2) / 3)
    .attr("width", 200)
    .attr("height", ydiff / 3)
    .append("xhtml:body")
    .attr("class", "branchlabel branchtime")
    .style("line-height", ydiff / 3 + "px")
    .text(b => elapsed(b.lastcommit));

  swimlanes
    .transition()
    .selectAll("foreignObject body.branchlabel.branchauthor")
    .text(d => d.lastcommitter);
  swimlanes
    .transition()
    .selectAll("foreignObject body.branchlabel.branchtime")
    .text(d => elapsed(d.lastcommit));
}

function drawlines(svg, links, nodes, x, y) {
  let lines = svg
    .selectAll(".commitline")
    .data(links, link => link.source + link.target);

  lines.exit().remove();

  function updatePosition(selection) {
    selection
      .attr("x1", link => x(nodes[link.source].timestamp))
      .attr("x2", link => x(nodes[link.target].timestamp))
      .attr("y1", link => y(nodes[link.source].branch))
      .attr("y2", link => y(nodes[link.target].branch))
      .attr("prehistoric", link => nodes[link.target].timestamp == 0);
  }

  updatePosition(
    lines
      .enter()
      .append("line")
      .attr("class", "commitline")
  );

  updatePosition(lines.transition());
}

function drawnodes(svg, nodes, relevants, x, y) {
  let selects = svg.selectAll(".commitobject").data(Object.keys(nodes), d => d);
  selects.exit().remove();

  function updatePosition(selection) {
    return selection.attr(
      "transform",
      n => `translate(${x(nodes[n].timestamp)}, ${y(nodes[n].branch)})`
    );
  }

  function updateCircles(selection) {
    return selection
      .attr("r", node => (relevants[node] ? 6 : 0))
      .attr("important", node => (relevants[node] ? true : false));
  }

  objects = selects
    .enter()
    .append("g")
    .attr("class", "commitobject");
  circles = updatePosition(objects)
    .append("svg:circle")
    .attr("class", "commitnode");
  updateCircles(circles);

  objects = selects.transition();
  updatePosition(objects);
  updateCircles(objects.select(".commitnode"));
}

pullfunction();
setInterval(pullfunction, 10000);
