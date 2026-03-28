#include "ta-log.h"
#include "ta-utils.h"

void reportError(String what) {
  logE("%s",what.c_str());
}
