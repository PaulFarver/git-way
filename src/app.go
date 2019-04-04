package main

import (
	"encoding/json"
	"flag"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"time"

	"gopkg.in/src-d/go-git.v4"
	"gopkg.in/src-d/go-git.v4/plumbing"
	"gopkg.in/src-d/go-git.v4/plumbing/object"
	githttp "gopkg.in/src-d/go-git.v4/plumbing/transport/http"
	"gopkg.in/yaml.v3"
)

type Configuration struct {
	Repository    string `yaml:"repository"`
	User          string `yaml:"user"`
	Token         string `yaml:"token"`
	Directory     string `yaml:"directory"`
	Fetchinterval int64  `yaml:"fetchinterval"`
}

// Graph is the root element containing all graph data
type Graph struct {
	Branches   []GraphBranch          `json:"branches"`
	References map[string][]CommitRef `json:"references"`
	Maxtime    int64                  `json:"maxtime"`
	Mintime    int64                  `json:"mintime"`
}

// GraphBranch is an element representing git branch
type GraphBranch struct {
	Name          string               `json:"name"`
	Nodes         map[string]GraphNode `json:"nodes"`
	LastCommit    int64                `json:"lastcommit"`
	LastCommitter string               `json:"lastcommitter"`
	Priority      int                  `json:"priority"`
}

// GraphNode is a struct containing information about a commit
type GraphNode struct {
	Parents   []string `json:"parentHashes"`
	Timestamp int64    `json:"timestamp"`
}

// CommitRef is a struct containing information about a git reference
type CommitRef struct {
	Ref  string `json:"ref"`
	Type string `json:"type"`
}

func check(err error) {
	if err != nil {
		panic(err)
	}
}

func ensureRepo(path, url string, auth githttp.AuthMethod) *git.Repository {
	repo, err := git.PlainOpen(path)
	if err == git.ErrRepositoryNotExists {
		repo, err = git.PlainClone(path, true, &git.CloneOptions{
			URL:        url,
			NoCheckout: true,
			Auth:       auth,
		})
	}
	check(err)
	return repo
}

func cleanRepo(repo *git.Repository) {
	refs, err := repo.References()
	check(err)
	refs.ForEach(func(ref *plumbing.Reference) error {
		if ref.Name().IsRemote() {
			repo.Storer.RemoveReference(ref.Name())
		}
		return nil
	})
}

func fetchFromRepo(repo *git.Repository, auth githttp.AuthMethod) *git.Repository {
	err := repo.Fetch(&git.FetchOptions{
		Auth: auth,
	})
	if err != git.NoErrAlreadyUpToDate {
		check(err)
	}
	return repo
}

func fetchRoutine(repo *git.Repository, auth githttp.AuthMethod, interval time.Duration) {
	for {
		cleanRepo(repo)
		fetchFromRepo(repo, auth)
		time.Sleep(interval)
	}
}

func getCheckTime(currTime time.Time, duration string) time.Time {
	dur, err := time.ParseDuration(duration)
	check(err)
	return currTime.Add(-dur)
}

var hotfixregex = regexp.MustCompile(`hotfix\/(.+)`)
var releaseregex = regexp.MustCompile(`release\/(.+)`)
var featureregex = regexp.MustCompile(`feature\/(.+)`)

func assignPriority(branch plumbing.ReferenceName) int {
	if branch.Short() == "master" || branch.Short() == "origin/master" {
		return 0
	}
	if hotfixregex.Match([]byte(branch)) {
		return 1
	}
	if releaseregex.Match([]byte(branch)) {
		return 2
	}
	if branch.Short() == "develop" || branch.Short() == "origin/develop" {
		return 3
	}
	if featureregex.Match([]byte(branch)) {
		return 4
	}
	return 5
}

func walkCommit(commit *object.Commit, after time.Time, nodes map[string]GraphNode, parsed map[string]bool) (map[string]GraphNode, map[string]bool) {
	if _, ok := parsed[commit.Hash.String()]; ok {
		return nodes, parsed
	}
	parentHashes := []string{}
	if !commit.Committer.When.Before(after) {
		commit.Parents().ForEach(func(parent *object.Commit) error {
			nodes, parsed = walkCommit(parent, after, nodes, parsed)
			parentHashes = append(parentHashes, parent.Hash.String())
			return nil
		})
		parsed[commit.Hash.String()] = true
	}
	nodes[commit.Hash.String()] = GraphNode{Timestamp: commit.Committer.When.Unix(), Parents: parentHashes}
	return nodes, parsed
}

func buildGraph(repo *git.Repository, current, after time.Time) []byte {
	branches := []GraphBranch{}
	branchHeads := make(map[string]plumbing.Hash)
	graph := Graph{Branches: []GraphBranch{}, References: make(map[string][]CommitRef), Maxtime: current.Unix(), Mintime: after.Unix()}

	// Discover branches
	refIter, err := repo.References()
	check(err)
	refIter.ForEach(func(r *plumbing.Reference) error {
		c, _ := repo.CommitObject(r.Hash())
		if r.Name().IsRemote() && r.Name().Short() != "origin/HEAD" {
			branches = append(branches, GraphBranch{Name: r.Name().Short(), LastCommit: c.Committer.When.Unix(), Priority: assignPriority(r.Name()), LastCommitter: c.Author.Name})
			branchHeads[r.Name().Short()] = r.Hash()
			graph.References[r.Hash().String()] = append(graph.References[r.Hash().String()], CommitRef{Ref: r.Name().Short(), Type: "branch"})
		}
		if r.Name().IsTag() {
			graph.References[r.Hash().String()] = append(graph.References[r.Hash().String()], CommitRef{Ref: r.Name().Short(), Type: "tag"})
		}
		return nil
	})

	excluded := make(map[string]bool)

	sort.Slice(branches, func(i, j int) bool {
		return branches[i].Priority == branches[j].Priority && branches[i].LastCommit > branches[j].LastCommit || branches[i].Priority < branches[j].Priority
	})
	for _, branch := range branches {
		c, _ := repo.CommitObject(branchHeads[branch.Name])
		branch.Nodes, excluded = walkCommit(c, after, make(map[string]GraphNode), excluded)
		graph.Branches = append(graph.Branches, branch)
	}

	// Write to file
	b, err := json.Marshal(graph)
	check(err)
	return b
}

func parseTimestampOrDefault(str string, def time.Time) time.Time {
	i, err := strconv.ParseInt(str, 10, 64)
	if err != nil {
		return def
	}
	return time.Unix(i, 0)
}

func parseGraphQuery(q url.Values) (time.Time, time.Time) {
	before := time.Now()
	b, ok := q["before"]
	if ok && len(b) > 0 {
		before = parseTimestampOrDefault(b[0], before)
	}
	after := getCheckTime(before, "250h")
	a, ok := q["after"]
	if ok && len(a) > 0 {
		after = parseTimestampOrDefault(a[0], after)
	}
	return before, after
}

func generateGraphHandler(repo *git.Repository, auth githttp.AuthMethod) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		before, after := parseGraphQuery(q)
		bytes := buildGraph(repo, before, after)
		w.Write(bytes)
	}
}

func grabConfiguration(path string) Configuration {
	conf := Configuration{}
	bytes, err := ioutil.ReadFile(path)
	if os.IsNotExist(err) {
		return conf
	}
	check(err)
	err = yaml.Unmarshal(bytes, &conf)
	check(err)
	return conf
}

func extractFromConfiguration(conf Configuration) (string, string, githttp.AuthMethod) {
	directory := "repositories/git-way"
	repository := "https://github.com/PaulFarver/git-way"
	auth := &githttp.BasicAuth{}
	auth = nil
	if conf.Directory != "" {
		directory = conf.Directory
	}
	if conf.Repository != "" {
		repository = conf.Repository
	}
	if conf.User != "" && conf.Token != "" {
		auth = &githttp.BasicAuth{
			Username: conf.User,
			Password: conf.Token,
		}
	}
	return directory, repository, auth
}

func main() {
	confpath := flag.String("c", "", "The configuration file for the repository to check out")
	flag.Parse()
	log.Println("Preparing repository...")
	conf := grabConfiguration(*confpath)
	directory, repository, auth := extractFromConfiguration(conf)
	repo := ensureRepo(directory, repository, auth)
	var seconds int64
	seconds = 60 * 1000000000
	if conf.Fetchinterval >= 1 {
		seconds = conf.Fetchinterval * 1000000000
	}
	go fetchRoutine(repo, auth, time.Duration(seconds))
	http.Handle("/", http.FileServer(http.Dir("www/")))
	http.HandleFunc("/api/graph", generateGraphHandler(repo, auth))
	log.Println("Ready to handle requests...")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
