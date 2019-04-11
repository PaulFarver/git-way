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
    // let svg = d3.select("#graph");
    render(JSON.parse(response));
    let b = performance.now();
    console.log(`Graph rendered in ${Math.round((b - a) * 10) / 10} ms`);
  });

  branchYs = {};
  diff = 60;
  curry = diff / 2;

  function getY(branch) {
    if (branchYs[branch] == null) {
      branchYs[branch] = curry;
      curry += diff;
    }
    return branchYs[branch];
  }

  function getX(timestamp, min, max, width) {
    return (width * (timestamp - min)) / (max - min);
  }

  function drawlanes(svg, branches, width, min) {
    ydiff = diff - 6;
    swimlanes = svg.selectAll(".branchlane").data(branches, b => b.name);
    swimlanes.exit().remove()
    g = swimlanes
      .enter()
      .append("g")
      .attr("class", "branchlane");
    g.append("rect")
      .attr("y", branch => getY(branch.name) - diff / 2)
      .attr("width", width)
      .attr("height", diff)
      .attr("class", "swimlane")
      .attr("priority", branch => branch.priority);
    g.append("foreignObject")
      .attr("x", width - 200)
      .attr("y", branch => getY(branch.name) - ydiff / 2)
      .attr("width", 200)
      .attr("height", ydiff / 3)
      .append("xhtml:body")
      .attr("class", "branchlabel branchname")
      .style("line-height", ydiff / 3 + "px")
      .html(branch => removePrefix(branch.name));
    g.append("foreignObject")
      .attr("x", width - 200)
      .attr("y", branch => getY(branch.name) - ydiff / 2 + ydiff / 3)
      .attr("width", 200)
      .attr("height", ydiff / 3)
      .append("xhtml:body")
      .attr("class", "branchlabel branchauthor")
      .style("line-height", ydiff / 3 + "px")
      .html(branch => branch.lastcommitter);
    g.append("foreignObject")
      .attr("x", width - 200)
      .attr("y", branch => getY(branch.name) - ydiff / 2 + (ydiff * 2) / 3)
      .attr("width", 200)
      .attr("height", ydiff / 3)
      .append("xhtml:body")
      .attr("class", "branchlabel branchtime")
      .style("line-height", ydiff / 3 + "px")
      .html(branch => elapsed(branch.lastcommit));

    swimlanes.transition().selectAll("foreignObject body.branchlabel.branchname").text(d => removePrefix(d.name))
    swimlanes.transition().selectAll("foreignObject body.branchlabel.branchauthor").text(d => d.lastcommitter)
    swimlanes.transition().selectAll("foreignObject body.branchlabel.branchtime").text(d => elapsed(d.lastcommit))
  }

  function drawlines(svg, links, nodes, min, max, width) {
    l = svg
      .selectAll(".commitline")
      .data(links, (link) => link.source+link.target);

    l.exit().remove();

    function updatePosition(link) {
      link
        .attr("x1", link => getX(nodes[link.source].timestamp, min, max, width))
        .attr("x2", link => getX(nodes[link.target].timestamp, min, max, width))
        .attr("y1", link => getY(nodes[link.source].branch))
        .attr("y2", link => getY(nodes[link.target].branch))
        .attr("prehistoric", link => nodes[link.target].timestamp == 0);
    }

    updatePosition(
      l
        .enter()
        .append("line")
        .attr("class", "commitline")
    );

    updatePosition(l.transition());
  }

  function drawnodes(svg, nodes, min, max, width, relevants) {
    n = svg
      .selectAll(".commitobject")
      .data(Object.keys(nodes), d => d);
    n.exit().remove();

    function updatePosition(commits) {
      commits
        .attr("r", node => (relevants[node] ? 6 : 0))
        .attr("important", node => (relevants[node] ? true : false))
        .attr("transform", node => {
          let x = getX(nodes[node].timestamp, min, max, width);
          let y = getY(nodes[node].branch);
          return `translate(${x}, ${y})`;
        });
    }

    updatePosition(
      n
        .enter()
        .append("g")
        .attr("class", "commitobject")
        .append("svg:circle")
        .attr("class", "commitnode")
    );

    updatePosition(n.transition().selectAll(".commitnode"));
  }

  function render(graph) {
    let svg = d3.select("#graph");

    let width = 1800;
    let padding = 0;

    graph.branches.forEach(branch => {
      getY(branch.name);
    });

    drawlanes(svg, graph.branches, width, graph.mintime);

    // var height = getY("final") - diff / 2;
    var height = 700;
    svg.attr(
      "viewBox",
      `-${padding} -${padding} ${width + padding * 2} ${height + padding * 2}`
    );

    drawlines(
      svg,
      graph.links,
      graph.nodes,
      graph.mintime,
      graph.maxtime,
      width - 200
    );

    drawnodes(
      svg,
      graph.nodes,
      graph.mintime,
      graph.maxtime,
      width - 200,
      graph.relevants
    );
  }
};

pullfunction();
setInterval(function() {
  pullfunction();
}, 10000);
