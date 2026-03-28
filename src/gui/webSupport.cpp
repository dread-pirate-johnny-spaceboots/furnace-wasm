/**
 * Furnace Tracker - multi-system chiptune tracker
 * Copyright (C) 2021-2026 tildearrow and contributors
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

#include "webSupport.h"

#include <cstdlib>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

EM_JS(int, furnace_web_consume_import_state_js, (), {
  if (!Module.furnaceWebConsumeImportState) return 0;
  return Module.furnaceWebConsumeImportState();
});

EM_JS(char*, furnace_web_consume_import_message_js, (), {
  if (!Module.furnaceWebConsumeImportMessage) return 0;
  const message = Module.furnaceWebConsumeImportMessage();
  if (!message) return 0;
  const size = lengthBytesUTF8(message) + 1;
  const pointer = _malloc(size);
  stringToUTF8(message, pointer, size);
  return pointer;
});

EM_JS(int, furnace_web_request_import_js, (const char* targetDir, const char* rawFilter, int allowMultiple), {
  if (!Module.furnaceWebRequestImport) return 0;
  return Module.furnaceWebRequestImport(UTF8ToString(targetDir), UTF8ToString(rawFilter), !!allowMultiple) ? 1 : 0;
});

EM_JS(void, furnace_web_download_file_js, (const char* path), {
  if (Module.furnaceWebDownloadFile) {
    Module.furnaceWebDownloadFile(UTF8ToString(path));
  }
});

EM_JS(void, furnace_web_download_directory_js, (const char* path, const char* archiveName), {
  if (Module.furnaceWebDownloadDirectory) {
    Module.furnaceWebDownloadDirectory(UTF8ToString(path), UTF8ToString(archiveName));
  }
});

EM_JS(void, furnace_web_download_selection_js, (const char* pathList, const char* archiveName), {
  if (Module.furnaceWebDownloadSelection) {
    Module.furnaceWebDownloadSelection(UTF8ToString(pathList), UTF8ToString(archiveName));
  }
});

EM_JS(void, furnace_web_download_prefix_js, (const char* path, const char* suffixMarker), {
  if (Module.furnaceWebDownloadPrefix) {
    Module.furnaceWebDownloadPrefix(UTF8ToString(path), UTF8ToString(suffixMarker));
  }
});

EM_JS(void, furnace_web_focus_canvas_js, (), {
  if (Module.furnaceWebFocusCanvas) {
    Module.furnaceWebFocusCanvas();
  }
});
#endif

bool furnaceWebEnabled() {
#ifdef __EMSCRIPTEN__
  return true;
#else
  return false;
#endif
}

int furnaceWebConsumeImportState() {
#ifdef __EMSCRIPTEN__
  return furnace_web_consume_import_state_js();
#else
  return 0;
#endif
}

String furnaceWebConsumeImportMessage() {
#ifdef __EMSCRIPTEN__
  char* message=furnace_web_consume_import_message_js();
  if (message==NULL) return "";
  String result=message;
  free(message);
  return result;
#else
  return "";
#endif
}

bool furnaceWebRequestImport(const char* targetDir, const char* rawFilter, bool allowMultiple) {
#ifdef __EMSCRIPTEN__
  return furnace_web_request_import_js(targetDir,rawFilter,allowMultiple?1:0)!=0;
#else
  return false;
#endif
}

void furnaceWebDownloadFile(const char* path) {
#ifdef __EMSCRIPTEN__
  furnace_web_download_file_js(path);
#else
  (void)path;
#endif
}

void furnaceWebDownloadDirectory(const char* path, const char* archiveName) {
#ifdef __EMSCRIPTEN__
  furnace_web_download_directory_js(path,archiveName?archiveName:"");
#else
  (void)path;
  (void)archiveName;
#endif
}

void furnaceWebDownloadSelection(const char* pathList, const char* archiveName) {
#ifdef __EMSCRIPTEN__
  furnace_web_download_selection_js(pathList,archiveName?archiveName:"");
#else
  (void)pathList;
  (void)archiveName;
#endif
}

void furnaceWebDownloadPrefix(const char* path, const char* suffixMarker) {
#ifdef __EMSCRIPTEN__
  furnace_web_download_prefix_js(path,suffixMarker);
#else
  (void)path;
  (void)suffixMarker;
#endif
}

void furnaceWebFocusCanvas() {
#ifdef __EMSCRIPTEN__
  furnace_web_focus_canvas_js();
#endif
}
