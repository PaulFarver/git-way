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
  render(svg, JSON.parse(response));
});

function getColor(branch) {
  if (branch == "origin/master") {
    return colormap[2];
  }
  if (branch == "origin/develop") {
    return colormap[1];
  }
  if (branch.startsWith("origin/hotfix/")) {
    return colormap[0];
  }
  if (branch.startsWith("origin/feature/")) {
    return colormap[3];
  }
  return colormap[4];
}

colormap = {
  0: "#2b303a",
  1: "#3772ff",
  2: "#f05033",
  3: "#453f78",
  4: "#759aab"
};

branchYs = {};
curry = 50;
diff = 30;

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

function render(svg, graph) {
  var w = Number(svg.attr("width"));
  var h = Number(svg.attr("height"));
  var padding = 0;
  svg.attr(
    "viewBox",
    `-${padding} -${padding} ${w + padding * 2} ${h + padding * 2}`
  );

  let min = graph.mintime;
  let max = graph.maxtime;
  let nodes = [];
  let nodeMap = {};
  let links = [];

  graph.branches
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
        if (node.prehistoric) {
          prehistoric = node;
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
              sourcehash: hash,
              targethash: parent
            });
          }
        });
      }
      first.important = true;
      last.important = true;
      links.push({
        sourcehash: last.hash,
        targethash: first.hash
      });
      if (prehistoric) {
        links.push({
          sourcehash: first.hash,
          targethash: prehistoric.hash
        });
      }
    });

  for (let ref in graph.references) {
    if (nodeMap[ref]) {
      nodeMap[ref].important = true;
      nodeMap[ref].refs = graph.references[ref];
    }
  }

  for (var key in branchYs) {
    key + branchYs[key];
    let c;
    svg.append("rect")
      .attr("y", branchYs[key] - diff / 2)
      .attr("x", 0)
      .attr("height", diff)
      .attr("width", w)
      .attr("fill", getColor(key));
    svg.append("text")
      .text(key.substr(7))
      .attr("font-family", '"Lucida Console", Monaco, monospace')
      .attr("font-size", "15px")
      .attr("alignment-baseline", "middle")
      .attr("y", branchYs[key])
      .attr("x", w-10)
      .attr("fill", "white")
      .attr("text-anchor", "end")
  }

  s = svg
    .selectAll(".line")
    .data(links)
    .enter();
  s.append("line")
    .attr("x1", d => nodeMap[d.sourcehash].x)
    .attr("y1", d => nodeMap[d.sourcehash].y)
    .attr("x2", d => nodeMap[d.targethash].x)
    .attr("y2", d => nodeMap[d.targethash].y)
    .attr("class", "commitline")
    .attr("stroke-dasharray", d => (nodeMap[d.targethash].prehistoric ? 5 : 0));

  let cNodes = svg
    .append("g")
    .selectAll("g")
    .data(nodes)
    .enter()
    .append("g")
    .attr("transform", ({ x, y }) => `translate(${x}, ${y})`);

  cNodes
    .append("svg:circle")
    .attr("r", n => (n.important && !n.prehistoric ? 6 : 0))
    .attr("fill", "white");

  taggs = cNodes
    .filter(d => {
      let k = false;
      d.refs.forEach(r => {
        if (r.type == "tag") {
          k = true;
        }
      });
      return k;
    })
    .append("g")
    .attr("x", 15)
    .attr("y", 1)
    .attr("transform", `rotate(-60) translate(10,0)`);

  taggs
    .append("path")
    .attr("d", "M0 0 L10 -10 L100 -10 L100 10 L10 10 Z")
    .attr("fill", "grey");
  taggs
    .append("text")
    .text(d => {
      let s = "";
      d.refs.forEach(r => {
        if (r.type == "tag") {
          s = r.ref;
        }
      });
      return s;
    })
    .attr("font-family", '"Lucida Console", Monaco, monospace')
    .attr("font-size", "15px")
    .attr("class", "taglabel")
    .attr("text-anchor", "start")
    .attr("alignment-baseline", "middle")
    .attr("transform", "translate(15,1)")
    .attr("fill", "white");

}
