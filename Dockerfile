FROM golang:alpine as build
RUN apk add --update git
RUN go get gopkg.in/src-d/go-git.v4
WORKDIR /build
COPY src/app.go app.go
RUN go build app.go

FROM alpine
WORKDIR /git-way
COPY src/www www
COPY --from=build /build/app app
ENTRYPOINT [ "./app" ]