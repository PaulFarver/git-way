package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"regexp"
	"time"

	"gopkg.in/src-d/go-git.v4"
	"gopkg.in/src-d/go-git.v4/plumbing"
	"gopkg.in/src-d/go-git.v4/plumbing/object"
)

type Graph struct {
	Branches   []GraphBranch          `json:"branches"`
	References map[string][]CommitRef `json:"references"`
}

type GraphBranch struct {
	Name  string               `json:"name"`
	Nodes map[string]GraphNode `json:"nodes"`
}

type GraphNode struct {
	Parents   []string `json:"parentHashes"`
	Timestamp int64    `json:"timestamp"`
}

type CommitRef struct {
	Ref  string `json:"ref"`
	Type string `json:"type"`
}

var checktime = getCheckTime(time.Now(), "10000h")

func check(err error) {
	if err != nil {
		panic(err)
	}
}

func ensureRepo() *git.Repository {
	repo, err := git.PlainOpen("../temp/go-git")
	if err != nil {
		repo, err = git.PlainClone("../temp/go-git", false, &git.CloneOptions{
			URL:      "https://github.com/src-d/go-git",
			Progress: os.Stdout,
		})
	}
	check(err)
	err = repo.Fetch(&git.FetchOptions{
		Progress: os.Stdout,
	})
	if err != git.NoErrAlreadyUpToDate {
		check(err)
	}
	err = repo.Prune(git.PruneOptions{})
	check(err)
	return repo
}

func getCheckTime(currTime time.Time, duration string) time.Time {
	dur, err := time.ParseDuration(duration)
	check(err)
	return currTime.Add(-dur)
}

var hotfixregex = regexp.MustCompile(`hotfix\/(.+)`)
var featureregex = regexp.MustCompile(`feature\/(.+)`)

func AssignPriority(branch plumbing.ReferenceName) int {
	if featureregex.Match([]byte(branch)) {
		return 3
	}
	if hotfixregex.Match([]byte(branch)) {
		return 1
	}
	if branch.Short() == "master" || branch.Short() == "origin/master" {
		return 0
	}
	if branch.Short() == "develop" || branch.Short() == "origin/develop" {
		return 2
	}
	return 4
}

func main() {
	fmt.Println("Checking out...")
	repo := ensureRepo()

	branches := [][]GraphBranch{[]GraphBranch{}, []GraphBranch{}, []GraphBranch{}, []GraphBranch{}, []GraphBranch{}}
	branchHeads := make(map[string]plumbing.Hash)
	graph := Graph{Branches: []GraphBranch{}, References: make(map[string][]CommitRef)}

	// Discover branches
	fmt.Println("Discovering remote branches...")
	refIter, err := repo.References()
	check(err)
	refIter.ForEach(func(r *plumbing.Reference) error {
		if r.Name().IsRemote() {
			branches[AssignPriority(r.Name())] = append(branches[AssignPriority(r.Name())], GraphBranch{Name: r.Name().Short()})
			branchHeads[r.Name().Short()] = r.Hash()
		}
		if r.Name().IsTag() {
			graph.References[r.Hash().String()] = append(graph.References[r.Hash().String()], CommitRef{Ref: r.Name().String(), Type: "tag"})
		}
		return nil
	})

	excluded := make(map[string]bool)
	for _, priority := range branches {
		for _, branch := range priority {
			fmt.Println("Walking branch: " + branch.Name)
			c, _ := repo.CommitObject(branchHeads[branch.Name])
			branch.Nodes, excluded = WalkCommit(c, make(map[string]GraphNode), excluded)
			fmt.Printf("found %v commits\n", len(branch.Nodes))
			graph.Branches = append(graph.Branches, branch)
		}
	}

	// Write to file
	b, err := json.Marshal(graph)
	check(err)
	err = ioutil.WriteFile("www/graph.json", b, 0644)
	check(err)
}

func WalkCommit(commit *object.Commit, nodes map[string]GraphNode, parsed map[string]bool) (map[string]GraphNode, map[string]bool) {
	if _, ok := parsed[commit.Hash.String()]; ok {
		return nodes, parsed
	}
	parentHashes := []string{}
	if !commit.Committer.When.Before(checktime) {
		commit.Parents().ForEach(func(parent *object.Commit) error {
			nodes, parsed = WalkCommit(parent, nodes, parsed)
			parentHashes = append(parentHashes, parent.Hash.String())
			return nil
		})
	}
	parsed[commit.Hash.String()] = true
	nodes[commit.Hash.String()] = GraphNode{Timestamp: commit.Committer.When.Unix(), Parents: parentHashes}
	return nodes, parsed
}
