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

#ifndef _FUR_WEB_SUPPORT_H
#define _FUR_WEB_SUPPORT_H

#include "../ta-utils.h"

bool furnaceWebEnabled();
int furnaceWebConsumeImportState();
String furnaceWebConsumeImportMessage();
bool furnaceWebRequestImport(const char* targetDir, const char* rawFilter, bool allowMultiple);
void furnaceWebDownloadFile(const char* path);
void furnaceWebDownloadDirectory(const char* path, const char* archiveName);
void furnaceWebDownloadSelection(const char* pathList, const char* archiveName);
void furnaceWebDownloadPrefix(const char* path, const char* suffixMarker);
void furnaceWebFocusCanvas();

#endif
