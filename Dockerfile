FROM centos:7

#ENV DEBIAN_FRONTEND=noninteractiv
#RUN apt update && apt install -y sqlite3
#RUN npm install node-pre-gyp -g
RUN curl -sL https://rpm.nodesource.com/setup_12.x | bash -
RUN yum install -y nodejs

RUN npm install -g autohpss@1.1.4 --unsafe

ADD htar /bin

#ADD . /tmp
#RUN cd /tmp && npm install -g . && restore -h
#ENV PATH=$PATH:/usr/local/bin
