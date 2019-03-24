package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"time"

	"gopkg.in/src-d/go-git.v4"
	"gopkg.in/src-d/go-git.v4/plumbing"
	"gopkg.in/src-d/go-git.v4/plumbing/object"
)

type GraphNode struct {
	Hash      string   `json:"id"`
	Title     string   `json:"title"`
	Type      string   `json:"type"`
	IsMain    bool     `json:"main"`
	Amount    int      `json:"amount"`
	Parents   []string `json:"parentIds"`
	Timestamp int64    `json:"timestamp"`
}

func check(err error) {
	if err != nil {
		panic(err)
	}
}

func ensureRepo() *git.Repository {
	// repo, err := git.PlainOpen("../../../Winterpath/Mach2")
	repo, err := git.PlainOpen("../temp/foo")
	if err != nil {
		repo, err = git.PlainClone("../temp/foo", false, &git.CloneOptions{
			URL:      "https://github.com/src-d/go-git",
			Progress: os.Stdout,
		})
	}
	check(err)
	return repo
}

func getCommits(repo *git.Repository) object.CommitIter {
	commits, err := repo.CommitObjects()
	check(err)
	return commits
}

func getCheckTime(currTime time.Time, duration string) time.Time {
	dur, err := time.ParseDuration(duration)
	check(err)
	return currTime.Add(-dur)
}

func main() {
	fmt.Println("Checking out...")
	repo := ensureRepo()
	commits := getCommits(repo)
	checktime := getCheckTime(time.Now(), "3300h")

	// ignored := make(map[plumbing.Hash]bool)
	// endNodes := make(map[plumbing.Hash]bool)
	// children := make(map[plumbing.Hash]int)

	// commits.ForEach(func(c *object.Commit) error {
	// 	if c.Author.When.Before(checktime) {
	// 		ignored[c.Hash] = true
	// 	}
	// 	c.Parents().ForEach(func(p *object.Commit) error {
	// 		children[p.Hash]++
	// 		if children[p.Hash] > 1 {
	// 			c.Parents().ForEach(func(p2 *object.Commit) error {
	// 				endNodes[p2.Hash] = true
	// 				return nil
	// 			})
	// 		}
	// 		return nil
	// 	})
	// 	return nil
	// })

	// startNodes := make(map[plumbing.Hash]bool)
	// commits.ForEach(func(c *object.Commit) error {
	// 	if c.Author.When.Before(checktime) {
	// 		return nil
	// 	}
	// 	if c.NumParents() != 1 {
	// 		startNodes[c.Hash] = true
	// 	}
	// 	for _, p := range c.ParentHashes {
	// 		pc, _ := repo.CommitObject(p)
	// 		if !pc.Author.When.Before(checktime) {
	// 			children[p]++
	// 			if children[p] > 1 || startNodes[c.Hash] {
	// 				endNodes[p] = true
	// 			}
	// 		} else {
	// 			startNodes[c.Hash] = true
	// 		}
	// 	}
	// 	return nil
	// })

	// Mark references as important
	master := plumbing.Hash{}

	refIter, err := repo.References()
	check(err)
	refIter.ForEach(func(r *plumbing.Reference) error {
		if r.Name() == plumbing.Master {
			master = r.Hash()
		}
		return nil
	})
	// Collect commits
	fmt.Println("Walking master branch")
	

	// for k := range endNodes {

	// 	if k.IsZero() || ignored[k] {
	// 		continue
	// 	}
	// 	fmt.Println("endNode " + k.String())
	// 	c, _ := repo.CommitObject(k)
	// 	nCommits := 0
	// 	p := c
	// 	t := "none"
	// 	parents := []string{}
	// 	for {
	// 		// Add parent hashes, if they are not ignored
	// 		// If only one parent exists, try again for that one
	// 		parents = []string{}
	// 		pp, _ := p.Parent(0)
	// 		if p.NumParents() == 1 && !ignored[pp.Hash] && !endNodes[pp.Hash] {
	// 			p = pp
	// 			nCommits++
	// 			continue
	// 		}
	// 		for _, gp := range p.ParentHashes {
	// 			if endNodes[gp] && !ignored[gp] && !gp.IsZero() {
	// 				parents = append(parents, gp.String())
	// 				continue
	// 			}
	// 		}
	// 		break
	// 	}
	// 	g := GraphNode{Parents: parents, Type: t, Hash: c.Hash.String(), Amount: nCommits, Timestamp: c.Author.When.Unix()}
	// 	// graphs[g.Hash] = g
	// 	graphs = append(graphs, g)
	// }

	addRoot := false
	graphs := []GraphNode{}
	fmt.Println("Collecting commits")
	commits.ForEach(func(c *object.Commit) error {
		if c.Author.When.Before(checktime) {
			return nil
		}
		parents := []string{}
		c.Parents().ForEach(func(p *object.Commit) error {
			if !p.Author.When.Before(checktime) {
				parents = append(parents, p.Hash.String())
			}
			return nil
		})
		if len(parents) == 0 {
			// parents = append(parents, "root")
		}
		graphs = append(graphs, GraphNode{Hash: c.Hash.String(), Parents: parents})
		return nil
	})
	if addRoot {
		graphs = append(graphs, GraphNode{Hash: "root"})
	}

	// Write to file
	b, err := json.Marshal(graphs)
	check(err)
	err = ioutil.WriteFile("www/graph.json", b, 0644)
	check(err)
}
