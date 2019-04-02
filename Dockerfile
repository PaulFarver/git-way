FROM golang:alpine as build
RUN go get gopkg.in/src-d/go-git.v4
COPY src/app.go app.go
RUN go build app.go

FROM alpine
COPY src/www www
COPY --from=build app app
ENTRYPOINT [ "./app" ]