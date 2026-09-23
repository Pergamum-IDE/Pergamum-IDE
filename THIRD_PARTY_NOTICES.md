# Third Party Notices

This file aggregates attribution and license information for the third-party
assets bundled with Pergamum. It covers:

- Feather icons
- Ionicons icons
- SVG Repo icons
- Codicons icons
- Typewriter sounds
- Character Mapping Data

## Feather icons

Pergamum includes selected SVG icons from Feather.

- Project: Feather
- Copyright: (c) 2013-2023 Cole Bemis
- Source: <https://github.com/feathericons/feather>
- License: MIT
- License text: `assets/icons/feather/LICENSE.txt`

Modifications:

- selected SVG files were copied into Pergamum's asset tree
  (`assets/icons/feather/`)
- file names and paths may have been changed to match Pergamum conventions
- icons may be styled by CSS, including size and color
- SVG path data is otherwise unmodified unless noted in commit history

## Ionicons icons

Pergamum includes selected SVG icons from Ionicons.

- Project: Ionicons
- Copyright: (c) 2015-present Ionic (<http://ionic.io/>)
- Source: <https://github.com/ionic-team/ionicons>
- License: MIT
- License text: `assets/icons/ionicons/LICENSE.txt`

Modifications:

- selected SVG files were copied into Pergamum's asset tree
  (`assets/icons/ionicons/`)
- file names and paths may have been changed to match Pergamum conventions
- icons may be styled by CSS, including size and color
- SVG path data is otherwise unmodified unless noted in commit history

## Codicons

Pergamum includes selected SVG icons from Codicons.

- Project: Codicons
- Copyright: Microsoft Corporation and contributors
- Source: <https://github.com/microsoft/vscode-codicons>
- License: Creative Commons Attribution 4.0 International Public License
- License text: `assets/icons/codicons/LICENSE`

Codicons states that Microsoft and contributors license documentation and other content in the repository under the Creative Commons Attribution 4.0 International Public License, and code under the MIT License.

Pergamum uses selected SVG icon assets from Codicons.

Modifications:

- selected SVG files were copied into Pergamum's asset tree
- file names and paths may have been changed to match Pergamum conventions
- icons may be styled by CSS, including size and color
- SVG path data is otherwise unmodified unless noted in commit history

No endorsement by Microsoft is implied. Microsoft, Visual Studio Code, VS Code, Windows, and related names or marks are trademarks or registered trademarks of Microsoft Corporation.

## SVG Repo icons

Pergamum includes selected SVG icons obtained from SVG Repo.

SVG Repo hosts icons under multiple licenses. Each imported SVG Repo icon is tracked with its original page and license.

See: `assets/icons/svgrepo/SOURCES.md'

## Typewriter sounds

Pergamum includes typewriter sound effects obtained from OpenGameArt.

- Source: OpenGameArt - Typewriter sounds
- Author: Cassie-OrbitGames
- URL: <https://opengameart.org/content/typewriter-sounds>
- License: CC0
- License checked: 2026-08-22
- Details: `assets/sounds/README.md`

Included files:

- `typewriter1.wav`
- `typewriter2.wav`
- `typewriter3.wav`
- `typewriter4.wav`
- `typewriter5.wav`
- `typewriter6.wav`
- `typewriter7.wav`
- `typewriter8.wav`

Pergamum usage:

- newline sound: `typewriter8.wav`
- keypress sound: `typewriter1.wav`, `typewriter2.wav`, `typewriter3.wav`, `typewriter4.wav`, `typewriter5.wav`, `typewriter6.wav`, `typewriter7.wav`

CC0 does not require attribution as a license condition, but Pergamum records this source for traceability.

## x0213.org Character Mapping Data

Pergamum includes a generated character mapping dataset derived from reference data published by x0213.org.

The generated dataset is used by Pergamum's Aozora Bunko-like preview renderer to map JIS X 0213 men-ku-ten codes to Unicode strings for supported gaiji replacement.

Included materials may include:

- the original reference text obtained from x0213.org
- conversion scripts used to generate Pergamum's JSON mapping data
- generated JSON mapping data for use by Pergamum

Pergamum gratefully acknowledges x0213.org for publishing and maintaining the reference data that made this functionality possible.

The generated mapping data represents factual character-code mapping information. Pergamum does not claim copyright over the original x0213.org reference data.

## highlight.js

Pergamum uses highlight.js for fenced code block syntax highlighting in Markdown Preview.

- Project: highlight.js
- Version: 11.x
- Copyright: Copyright (c) 2006, Ivan Sagalaev.
- Source: <https://github.com/highlightjs/highlight.js>
- License: BSD 3-Clause License

```
BSD 3-Clause License

Copyright (c) 2006, Ivan Sagalaev.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
