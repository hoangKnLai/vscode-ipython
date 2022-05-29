# ipython

Simple hooks to enable direct execution of `python` code from editor to an
IPython terminal.

Note: this is pretty hacky and requires tuning delays depending on your system,
but it works.

## Features
- Settings to control the startup of an IPython console
  - Console launch argument (e.g., `--matplotlib=qt5`)
  - Console start up command (e.g., `["%load_ext autoreload", %autoreload 2]`)
- Configurable cell block tag (e.g. `# %%`)
- Commands to run cells, code selections, up to / from line,

## Requirements

[Microsoft Python Extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python)

## Known Issues

- Sending code to the terminal is slow and has no feedback. IPython interprets
  newlines differently when they are sent in a buffer. As such, smooth
  functionality depends on tuning some delays (in settings) particularly to your
  machine. Note that running IPython with `--simple-prompt` makes newline
  behavior more predictable, but you lose tab-complete and colors.

## Release Notes

See [the change log](CHANGELOG.md).