FROM golang:alpine as build
RUN apk add --update git
RUN go get gopkg.in/src-d/go-git.v4 gopkg.in/yaml.v3
WORKDIR /build
COPY src/app.go app.go
RUN go build app.go

FROM alpine
WORKDIR /git-way
RUN apk add --update --no-cache ca-certificates
COPY src/default.yml default.yml
COPY src/www www
COPY --from=build /build/app app
ENTRYPOINT [ "./app" ]
CMD [ "-c", "default.yml" ]