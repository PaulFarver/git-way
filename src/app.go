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

type GraphNode struct {
	Hash      string   `json:"id"`
	Title     string   `json:"title"`
	Branch    string   `json:"branch"`
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
	err = repo.Fetch(&git.FetchOptions{
		Progress: os.Stdout,
	})
	if err != git.NoErrAlreadyUpToDate {
		check(err)
	}
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
	checktime := getCheckTime(time.Now(), "744h")

	branchKeys := [][]string{[]string{}, []string{}, []string{}, []string{}, []string{}, []string{}}
	branches := make(map[string]plumbing.Hash)
	refIter, err := repo.References()
	fmt.Println("Discovering remote branches...")

	check(err)
	refIter.ForEach(func(r *plumbing.Reference) error {
		if r.Name().IsRemote() {
			branches[r.Name().Short()] = r.Hash()
			branchKeys[AssignPriority(r.Name())] = append(branchKeys[AssignPriority(r.Name())], r.Name().Short())
		}
		return nil
	})
	// Collect commits
	graphs := []GraphNode{}
	branchcommits := []GraphNode{}
	excludes := make(map[plumbing.Hash]bool)

	for _, pBranches := range branchKeys {
		for _, name := range pBranches {
			fmt.Println("Walking branch: " + name)
			hash := branches[name]
			c, _ := repo.CommitObject(hash)
			branchcommits, excludes, _ = WalkCommit(c, excludes, checktime, GraphNode{Branch: name})
			fmt.Printf("found %v commits\n", len(branchcommits))
			graphs = append(graphs, branchcommits...)
		}
	}

	// graphs = append(graphs, allcommits...)

	// Write to file
	b, err := json.Marshal(graphs)
	check(err)
	err = ioutil.WriteFile("www/graph.json", b, 0644)
	check(err)
}

func WalkCommit(commit *object.Commit, excludes map[plumbing.Hash]bool, checktime time.Time, template GraphNode) ([]GraphNode, map[plumbing.Hash]bool, bool) {
	// Check if commit has been parsed before
	if commit.Committer.When.Before(checktime) {
		return nil, excludes, false
	}
	if excludes[commit.Hash] {
		return nil, excludes, true
	}
	graphs := []GraphNode{}
	parentIds := []string{}
	// Parse parents
	commit.Parents().ForEach(func(parent *object.Commit) error {
		parentGraphs, ex, include := WalkCommit(parent, excludes, checktime, template)
		excludes = ex
		graphs = append(graphs, parentGraphs...)
		if include {
			parentIds = append(parentIds, parent.Hash.String())
		}
		return nil
	})
	g := template
	g.Hash = commit.Hash.String()
	g.Parents = parentIds
	g.Timestamp = commit.Committer.When.Unix()
	excludes[commit.Hash] = true
	return append(graphs, g), excludes, true
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
