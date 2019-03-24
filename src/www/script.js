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

function getPrecedence(branch){
  if (branch == "origin/master"){
    return 0
  }
  if (branch == "origin/develop"){
    return 2
  }
  if (branch.startsWith("origin/hotfix/")){
    return 1
  }
  if (branch.startsWith("origin/feature/")){
    return 3
  }
  return 4
}

branchYs = {
};
curry = 80;

function getY(branch) {
  if (branchYs[branch] == null) {
    curry += 40;
    branchYs[branch] = curry;
  }
  return branchYs[branch];
}

function render(svg, graph) {
  count = {};
  graph
    .sort((g1, g2) => {
      return g1.timestamp - g2.timestamp
    })
    .sort((g1, g2) => {
      return getPrecedence(g1.branch) - getPrecedence(g2.branch);
    })
    .forEach(element => {
      count[element.branch] = 0;
      getY(element.branch);
    });
  var w = 1900;
  var h = 600;
  var padding = 40;
  svg.attr("width", w).attr("height", h);
  svg.attr(
    "viewBox",
    `-${padding} -${padding} ${w + padding * 2} ${h + padding * 2}`
  );
  let min = graph[0].timestamp;
  let max = graph[0].timestamp;
  graph
    .sort((g1, g2) => {
      return g2.timestamp - g1.timestamp;
    })
    .forEach(element => {
      if (element.timestamp > max) {
        max = element.timestamp;
      }
      if (element.timestamp < min) {
        min = element.timestamp;
      }
    });
  nodeMap = [];
  nodes = [];
  links = [];
  last = {};
  graph
    .sort((g1, g2) => {
      return g1.timestamp - g2.timestamp;
    })
    .forEach(element => {
      let x = ((element.timestamp - min) / (max - min)) * w;
      count[element.branch] = count[element.branch] + 1;
      // count++;

      if (element.important) {
        let node = {
          id: element.id,
          x: x,
          y: getY(element.branch),
          important: element.important,
          branch: element.branch,
          refs: element.references,
          parents: element.parentIds
        };
        nodes.push(node);
        nodeMap[element.id] = nodes.length - 1;
        if (last[element.branch] != null) {
          links.push({
            source: nodes[nodes.length - 1],
            target: nodes[last[element.branch]],
            count: count[element.branch]
          });
        }
        last[element.branch] = nodes.length - 1;
        count[element.branch] = 0;
      }
    });
  graph.forEach(element => {
    element.parentIds.forEach(id => {
      if (
        nodeMap[element.id] != null &&
        nodeMap[id] != null &&
        nodes[nodeMap[id]].branch != element.branch
      ) {
        links.push({
          source: nodes[nodeMap[element.id]],
          target: nodes[nodeMap[id]],
          count: 0
        });
      }
    });
  });

  s = svg
    .selectAll(".line")
    .data(links)
    .enter();
  s.append("line")
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y)
    .attr("class", "commitline");
  s.filter(d => d.count > 0)
    .append("svg:circle")
    .attr("class", "squashlabel")
    .attr("cx", d => (d.source.x + d.target.x) / 2)
    .attr("cy", d => (d.source.y + d.target.y) / 2)
    .attr("display", d => (d.source.x - d.target.x < 40 ? "none" : "block"))
    .attr("r", 20);
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
    .attr("r", 5)
    .attr("class", d => {
      let c = "commitnode";
      if (d.important) {
        c = c + " importantcommit";
      }
      if (d.branch == "origin/master") {
        c = c + " master";
      }
      if (d.branch.startsWith("origin/hotfix")) {
        c = c + " hotfix";
      }
      if (d.branch.startsWith("origin/feature")) {
        c = c + " feature";
      }
      if (d.branch == "origin/develop") {
        c = c + " develop";
      }
      return c;
    });

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
    .attr("transform", `translate(15,-10) rotate(-40)`);

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
    .attr("text-anchor", "start");

  branchgs = cNodes
    .filter(d => {
      let k = false;
      d.refs.forEach(r => {
        if (r.type == "branch") {
          k = true;
        }
      });
      return k;
    })
    .append("g")
    .attr("x", 15)
    .attr("y", 0)
    .attr("transform", `translate(15,5)`);

  branchgs
    .append("text")
    .text(d => {
      let s = "";
      d.refs.forEach(r => {
        if (r.type == "branch") {
          if (r.ref.startsWith("origin/")) {
            s = r.ref.substr(7);
          }
        }
      });
      return s;
    })
    .attr("font-family", '"Lucida Console", Monaco, monospace')
    .attr("font-size", "15px")
    .attr("class", "branchlabel")
    .attr("text-anchor", "start");

}
