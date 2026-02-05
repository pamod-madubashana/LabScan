.PHONY: build clean test

build:
	go build -o bin/labscan-agent .

build-windows:
	GOOS=windows GOARCH=amd64 go build -o bin/labscan-agent.exe .

build-linux:
	GOOS=linux GOARCH=amd64 go build -o bin/labscan-agent .

clean:
	rm -rf bin/

test:
	go test ./...

install-deps:
	go mod tidy