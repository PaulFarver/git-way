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

colormap = {
  0: "#2b303a",
  1: "#3772ff",
  2: "#f05033",
  3: "#453f78",
  4: "#759aab"
};

branchYs = {};
curry = 50;
diff = 80;

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
  count = {};
  var w = 1800;
  var h = 600;
  var padding = 60;
  svg.attr("width", w).attr("height", h);
  svg.attr(
    "viewBox",
    `-${padding} -${padding} ${w + padding * 2} ${h + padding * 2}`
  );

  let min = graph.mintime;
  let max = graph.maxtime;
  let nodes = [];
  let nodeMap = {};
  let links = [];

  graph.branches.forEach(branch => {
    for (let hash in branch.nodes) {
      let commit = branch.nodes[hash];
      node = {
        x: ((commit.timestamp - min) / (max - min)) * w,
        y: getY(branch.name),
        important: false
      };
      if (commit.timestamp < min) {
        node.x = -40;
        node.prehistoric = true;
        branch.prehistoric = node;
      } else {
        branch.first =
          !branch.first || node.x < branch.first.x ? node : branch.first;
        branch.last =
          !branch.last || node.x > branch.last.x ? node : branch.last;
      }
      nodes.push(node);
      nodeMap[hash] = node;
      commit.parentHashes.forEach(parent => {
        if (!branch.nodes[parent]) {
          node.important = true;
          if (nodeMap[parent]) {
            links.push({
              source: node,
              target: nodeMap[parent]
            });
            nodeMap[parent].important = true;
          }
        }
      });
    }
    if (branch.prehistoric && branch.first){
      branch.first.important = true
      links.push({
        source: branch.prehistoric,
        target: branch.first,
      })
    }
    if (branch.first && branch.last){
      branch.first.important = true
      branch.last.important = true
      links.push({
        source: branch.first,
        target: branch.last,
      })
    }
  });

  last = {};
  // graph
  //   .sort((g1, g2) => {
  //     return g1.timestamp - g2.timestamp;
  //   })
  //   .forEach(element => {
  //     let x = ((element.timestamp - min) / (max - min)) * w;
  //     count[element.branch] = count[element.branch] + 1;
  //     // count++;

  //     if (element.important) {
  //       let node = {
  //         hash: element.hash,
  //         x: x,
  //         y: getY(element.branch),
  //         important: element.important,
  //         branch: element.branch,
  //         refs: element.references,
  //         parents: element.parentHashes
  //       };
  //       nodes.push(node);
  //       nodeMap[element.hash] = nodes.length - 1;
  //       if (last[element.branch] != null) {
  //         links.push({
  //           source: nodes[nodes.length - 1],
  //           target: nodes[last[element.branch]],
  //           count: count[element.branch]
  //         });
  //       }
  //       last[element.branch] = nodes.length - 1;
  //       count[element.branch] = 0;
  //     }
  //   });
  // graph.forEach(element => {
  //   element.parentHashes.forEach(hash => {
  //     if (
  //       nodeMap[element.hash] != null &&
  //       nodeMap[hash] != null &&
  //       nodes[nodeMap[hash]].branch != element.branch
  //     ) {
  //       links.push({
  //         source: nodes[nodeMap[element.hash]],
  //         target: nodes[nodeMap[hash]],
  //         count: 0
  //       });
  //     }
  //   });
  // });

  for (var key in branchYs) {
    key + branchYs[key];
    let c;
    svg
      .append("rect")
      .attr("y", branchYs[key] - diff / 2)
      .attr("x", -125)
      .attr("height", diff)
      .attr("width", w + 250);
    // .attr("fill", colormap[getPrecedence(key)]);
  }

  s = svg
    .selectAll(".line")
    .data(links)
    .enter();
  s.append("line")
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y)
    .attr("class", "commitline")
    .attr("stroke-dasharray", l => l.source.prehistoric || l.target.prehistoric ? 5 : 0)
  s.filter(d => d.count > 0)
    .append("svg:circle")
    .attr("class", "squashlabel")
    .attr("cx", d => (d.source.x + d.target.x) / 2)
    .attr("cy", d => (d.source.y + d.target.y) / 2)
    .attr("display", d => (d.source.x - d.target.x < 40 ? "none" : "block"))
    .attr("r", 20)
    .attr("fill", d => colormap[getPrecedence(d.source.branch)]);
  s.filter(d => d.count > 0)
    .append("text")
    .attr("x", d => (d.source.x + d.target.x) / 2)
    .attr("y", d => (d.source.y + d.target.y) / 2)
    .attr("display", d => (d.source.x - d.target.x < 40 ? "none" : "block"))
    .text(d => d.count)
    .attr("font-family", '"Lucida Console", Monaco, monospace')
    .attr("font-size", "16px")
    .attr("class", "squashlabeltext")
    .attr("text-anchor", "middle")
    .attr("alignment-baseline", "middle");

  let cNodes = svg
    .append("g")
    .selectAll("g")
    .data(nodes)
    .enter()
    .append("g")
    .attr("transform", ({ x, y }) => `translate(${x}, ${y})`);

  cNodes
    .append("svg:circle")
    .attr("r", n => n.important && !n.prehistoric ? 6 : 0)
    .attr("fill", "white")

  // taggs = cNodes
  //   .filter(d => {
  //     let k = false;
  //     d.refs.forEach(r => {
  //       if (r.type == "tag") {
  //         k = true;
  //       }
  //     });
  //     return k;
  //   })
  //   .append("g")
  //   .attr("x", 15)
  //   .attr("y", 1)
  //   .attr("transform", `rotate(-60) translate(10,0)`);

  // taggs
  //   .append("path")
  //   .attr("d", "M0 0 L10 -10 L100 -10 L100 10 L10 10 Z")
  //   .attr("fill", "grey");
  // taggs
  //   .append("text")
  //   .text(d => {
  //     let s = "";
  //     d.refs.forEach(r => {
  //       if (r.type == "tag") {
  //         s = r.ref;
  //       }
  //     });
  //     return s;
  //   })
  //   .attr("font-family", '"Lucida Console", Monaco, monospace')
  //   .attr("font-size", "15px")
  //   .attr("class", "taglabel")
  //   .attr("text-anchor", "start")
  //   .attr("alignment-baseline", "middle")
  //   .attr("transform", "translate(15,1)")
  //   .attr("fill", "white");

  // branchgs = cNodes
  //   .filter(d => {
  //     let k = false;
  //     d.refs.forEach(r => {
  //       if (r.type == "branch") {
  //         k = true;
  //       }
  //     });
  //     return k;
  //   })
  //   .append("g")
  //   .attr("x", 15)
  //   .attr("y", 0)
  //   .attr("transform", `translate(15,5)`);

  // branchgs
  //   .append("text")
  //   .text(d => {
  //     let s = "";
  //     d.refs.forEach(r => {
  //       if (r.type == "branch") {
  //         if (r.ref.startsWith("origin/")) {
  //           s = r.ref.substr(7);
  //         }
  //       }
  //     });
  //     return s;
  //   })
  //   .attr("font-family", '"Lucida Console", Monaco, monospace')
  //   .attr("font-size", "15px")
  //   .attr("class", "branchlabel")
  //   .attr("text-anchor", "start");
}
