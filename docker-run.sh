#!/bin/sh

docker run -d -p 4000:4000 \
	-v $(pwd)/src:/usr/src/app \
	-v /root/.docker/machine/certs:/remote-tls:ro \
	--name start-to-know-service david/start-to-know-service
