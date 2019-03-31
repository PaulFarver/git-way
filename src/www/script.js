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

var svg = d3.select("#graph");

var client = new HttpClient();
client.get("graph.json", function(response) {
  let a = performance.now();
  render(svg, JSON.parse(response));
  let b = performance.now();
  console.log(`Graph took ${Math.round((b - a) * 10) / 10} ms to render.`);
});

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

function getX(timestamp) {
  return function(width, min, max) {
    return (width * (timestamp - min)) / (max - min);
  };
}

function traverseGraph(branches, min, max, w) {
  let nodes = [];
  let nodeMap = {};
  let links = [];
  function deferResolve(hash) {
    return function() {
      nodeMap[hash].important = true;
      return nodeMap[hash];
    };
  }
  branches
    .sort((b1, b2) => b2.lastcommit - b1.lastcommit)
    .sort((b1, b2) => b1.priority - b2.priority)
    .forEach(branch => {
      let first, last, prehistoric;
      if (branch.lastcommit < min) {
        return;
      }
      for (let hash in branch.nodes) {
        let commit = branch.nodes[hash];
        node = {
          hash: hash,
          x: ((commit.timestamp - min) / (max - min)) * (w - 250),
          y: getY(branch.name),
          important: false,
          refs: [],
          prehistoric: commit.timestamp < min
        };
        if (commit.timestamp < min) {
          prehistoric = hash;
        } else {
          first = !first || node.x < first.x ? node : first;
          last = !last || node.x > last.x ? node : last;
        }
        nodes.push(node);
        nodeMap[hash] = node;
        commit.parentHashes.forEach(parent => {
          if (!branch.nodes[parent]) {
            node.important = true;
            links.push({
              source: deferResolve(hash),
              target: deferResolve(parent)
            });
          }
        });
      }
      links.push({
        source: deferResolve(last.hash),
        target: deferResolve(first.hash)
      });
      if (prehistoric) {
        links.push({
          source: deferResolve(first.hash),
          target: deferResolve(prehistoric)
        });
      }
    });
  links.forEach(l => {
    l.source = l.source();
    l.target = l.target();
  });
  return {
    nodes: nodes,
    links: links
  };
}

function drawlanes(svg, branches, width) {
  branches.forEach(branch => {
    key = branch.name;
    let ydiff = diff - 6;
    g = svg
      .append("g")
      .attr("width", width)
      .attr("y", branchYs[key] - diff / 2)
      .attr("height", diff);
    g.append("rect")
      .attr("y", branchYs[key] - diff / 2)
      .attr("x", 0)
      .attr("class", "swimlane")
      .attr("priority", branch.priority)
      .attr("height", diff)
      .attr("width", width);
    g.append("foreignObject")
      .attr("x", width - 200)
      .attr("y", branchYs[key] - ydiff / 2)
      .attr("width", 200)
      .attr("height", ydiff / 3)
      .append("xhtml:body")
      .attr("class", "branchlabel branchname")
      .style("line-height", ydiff / 3 + "px")
      .html(removePrefix(key));
    g.append("foreignObject")
      .attr("x", width - 200)
      .attr("y", branchYs[key] - ydiff / 2 + ydiff / 3)
      .attr("width", 200)
      .attr("height", ydiff / 3)
      .append("xhtml:body")
      .attr("class", "branchlabel branchauthor")
      .style("line-height", ydiff / 3 + "px")
      .html(branch.lastcommitter);
    g.append("foreignObject")
      .attr("x", width - 200)
      .attr("y", branchYs[key] - ydiff / 2 + (ydiff * 2) / 3)
      .attr("width", 200)
      .attr("height", ydiff / 3)
      .append("xhtml:body")
      .attr("class", "branchlabel branchtime")
      .style("line-height", ydiff / 3 + "px")
      .html(elapsed(branch.lastcommit));
  });
}

function drawlines(svg, links) {
  svg
    .append("g")
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y)
    .attr("class", "commitline")
    .attr("prehistoric", d => d.target.prehistoric);
}

function drawnodes(svg, nodes, references) {
  commitNodes = svg
    .append("g")
    .selectAll("g")
    .data(nodes)
    .enter()
    .append("g")
    .attr("transform", ({ x, y }) => `translate(${x}, ${y})`);

  commitNodes
    .append("svg:circle")
    .attr("class", "commitnode")
    .attr("r", n => n.important ? 6 : 0)
    .attr("important", n => n.important);

  tags = commitNodes
    .filter(d => references[d.hash])
    .append("g")
    .selectAll("g")
    .data(d => references[d.hash])
    .enter()
    .append("g")
    .attr("class", "tag")
    .attr("type", r => r.type)

  tags
    .append("path")
    .attr("d", "M0 0 L10 -10 L60 -10 L60 10 L10 10 Z")
    .attr("class", "tagshape")
  
  tags.append("foreignObject")
    .attr("y", "-10")
    .attr("height", 20)
    .attr("width", 60)
    .append("xhtml:body")
    .style("line-height", "20px")
    .attr("class", "tagtext")
    .html(r => removePrefix(r.ref))
}

function render(svg, graph) {
  var width = 1800;
  var padding = 0;

  result = traverseGraph(graph.branches, graph.mintime, graph.maxtime, width);
  let nodes = result.nodes;
  let links = result.links;

  var height = getY("final") - diff / 2;
  svg.attr(
    "viewBox",
    `-${padding} -${padding} ${width + padding * 2} ${height + padding * 2}`
  );

  drawlanes(svg, graph.branches, width);

  drawlines(svg, links);

  drawnodes(svg, nodes, graph.references);
}
