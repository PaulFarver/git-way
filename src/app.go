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
	Hash       string      `json:"id"`
	Title      string      `json:"title"`
	Branch     string      `json:"branch"`
	Amount     int         `json:"amount"`
	Parents    []string    `json:"parentIds"`
	Timestamp  int64       `json:"timestamp"`
	Important  bool        `json:"important"`
	References []CommitRef `json:"references"`
}

type CommitRef struct {
	Ref  string `json:"ref"`
	Type string `json:"type"`
}

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
	checktime := getCheckTime(time.Now(), "1000h")

	// Discover branches
	branchKeys := [][]string{[]string{}, []string{}, []string{}, []string{}, []string{}, []string{}}
	branches := make(map[string]plumbing.Hash)
	references := make(map[plumbing.ReferenceName]plumbing.Hash)
	fmt.Println("Discovering remote branches...")
	refIter, err := repo.References()
	check(err)
	refIter.ForEach(func(r *plumbing.Reference) error {
		if r.Name().IsRemote() {
			branches[r.Name().Short()] = r.Hash()
			branchKeys[AssignPriority(r.Name())] = append(branchKeys[AssignPriority(r.Name())], r.Name().Short())
		}
		if r.Name().IsRemote() || r.Name().IsTag() {
			references[r.Name()] = r.Hash()
		}
		return nil
	})

	// Collect commits
	graphs := []GraphNode{}
	commits := make(map[plumbing.Hash]GraphNode)
	for _, pBranches := range branchKeys {
		for _, name := range pBranches {
			fmt.Println("Walking branch: " + name)
			hash := branches[name]
			c, _ := repo.CommitObject(hash)
			commits, _, _ = WalkCommit(c, commits, checktime, GraphNode{Branch: name, References: []CommitRef{}})
			fmt.Printf("found %v commits\n", len(commits))
		}
	}

	// Assign references
	for k, v := range references {
		if c, ok := commits[v]; ok {
			fmt.Println("Assigning " + k.Short())
			t := "branch"
			c.Important = true
			if k.IsTag() {
				t = "tag"
			}
			c.References = append(c.References, CommitRef{Type: t, Ref: k.Short()})
			commits[v] = c
		}
	}

	// Collect graphs
	for _, v := range commits {
		graphs = append(graphs, v)
	}

	// Write to file
	b, err := json.Marshal(graphs)
	check(err)
	err = ioutil.WriteFile("www/graph.json", b, 0644)
	check(err)
}

func WalkCommit(commit *object.Commit, commits map[plumbing.Hash]GraphNode, checktime time.Time, template GraphNode) (map[plumbing.Hash]GraphNode, bool, bool) {
	// Check if commit has been parsed before
	if commit.Committer.When.Before(checktime) {
		return commits, false, true
	}
	if i, ok := commits[commit.Hash]; ok && i.Branch != template.Branch {
		i.Important = true
		commits[commit.Hash] = i
		return commits, true, true
	}
	if _, ok := commits[commit.Hash]; ok {
		return commits, true, false
	}
	// graphs := []GraphNode{}
	parentIds := []string{}
	becomeImportant := false
	// Parse parents
	if commit.NumParents() == 0 {
		becomeImportant = true
	}
	commit.Parents().ForEach(func(parent *object.Commit) error {
		ex, include, b := WalkCommit(parent, commits, checktime, template)
		commits = ex
		becomeImportant = b
		// graphs = append(graphs, parentGraphs...)
		if include {
			parentIds = append(parentIds, parent.Hash.String())
		}
		return nil
	})
	g := template
	g.Hash = commit.Hash.String()
	g.Parents = parentIds
	g.Timestamp = commit.Committer.When.Unix()
	g.Important = becomeImportant
	commits[commit.Hash] = g
	return commits, true, false
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
