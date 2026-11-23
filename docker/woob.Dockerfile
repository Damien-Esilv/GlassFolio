# GlassFolio bank worker (TGLA-239): Woob in its own container, for the self-hosted image.
# Started only with the `woob` profile:  docker compose --env-file docker/docker.env --profile woob up -d --build
# The main container reaches it on the Compose network (http://woob:47832); the port is never published.
# Supply chain: base images pinned by digest, Woob pinned by commit (git checks it), Python packages by hash.

# 1. Woob source at its pinned commit
FROM alpine/git@sha256:29cff25811f790b9f72fc266bf8009a5a911714c0e03c31c47339c50909d9aef AS woob-source
ARG WOOB_COMMIT=49f267fe1d3890d994ed511acac3d77dcd884e60
WORKDIR /src
RUN git init -q . \
 && git fetch -q --depth 1 https://gitlab.com/woob/woob.git "$WOOB_COMMIT" \
 && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$WOOB_COMMIT"

# 2. Locked dependencies (wheels only, hashes checked), Woob, the worker and the shipped bank modules
FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df AS build
WORKDIR /build
COPY companions/woob/requirements.lock companions/woob/woob-source.json ./
# chompjs (Caisse d'Épargne only) ships no Linux ARM wheel: left out there, the worker then simply does not
# offer that bank (its status lists the bank modules that load)
RUN python -c "import platform, re, pathlib; lock = pathlib.Path('requirements.lock'); text = lock.read_text(); lock.write_text(re.sub(r'(?ms)^chompjs==.*?(?=^\S)', '', text) if platform.machine() in ('aarch64', 'arm64') else text)" \
 && python -m pip install --no-cache-dir --disable-pip-version-check --no-deps --require-hashes --only-binary=:all: \
      --target /opt/woob/site -r requirements.lock
COPY --from=woob-source /src/woob /opt/woob/site/woob
COPY --from=woob-source /src/modules /build/all-modules
COPY --from=woob-source /src/COPYING.LESSER /opt/woob/LICENSES/woob-COPYING.LESSER
COPY companions/woob/glassfolio_woob /opt/woob/site/glassfolio_woob
COPY companions/woob/LICENSES /opt/woob/LICENSES
RUN mkdir -p /opt/woob/woob-modules
COPY companions/woob/glassfolio_woob/catalog.py ./catalog.py
# Every bank module of Woob and the modules they import (catalog.py, TGLA-240)
RUN for name in $(python catalog.py closure /build/all-modules); do cp -r "/build/all-modules/$name" "/opt/woob/woob-modules/$name"; done \
 && cp woob-source.json /opt/woob/woob-source.json \
 && find /opt/woob -name 'test*.py' -path '*woob-modules*' -delete \
 && rm -rf /opt/woob/site/selenium/webdriver/common/macos /opt/woob/site/selenium/webdriver/common/windows \
           /opt/woob/site/selenium/webdriver/common/linux-x86_64 /opt/woob/site/selenium/webdriver/common/linux-arm64 \
 && python -m compileall -q -j 0 --invalidation-mode unchecked-hash /opt/woob/site /opt/woob/woob-modules

# 3. Runtime: no build tools, unprivileged user, read-only file system (see docker-compose.yml)
FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
COPY --from=build /opt/woob /opt/woob
# `python -I` ignores PYTHONPATH: the worker's packages are added through a .pth file of the site directory
RUN echo /opt/woob/site > "$(python -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')/glassfolio-woob.pth" \
 && useradd --uid 1000 --no-create-home --shell /usr/sbin/nologin woob \
 && mkdir -p /data /run/glassfolio-token && chown woob /data /run/glassfolio-token
ENV GLASSFOLIO_WOOB_MODULES=/opt/woob/woob-modules \
    GLASSFOLIO_WOOB_DATA=/data \
    GLASSFOLIO_WOOB_TOKEN_FILE=/run/glassfolio-token/token \
    GLASSFOLIO_WOOB_IN_CONTAINER=1
USER woob
EXPOSE 47832
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["python", "-I", "-B", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:47832/health', timeout=4)"]
CMD ["python", "-I", "-B", "-m", "glassfolio_woob", "serve"]
