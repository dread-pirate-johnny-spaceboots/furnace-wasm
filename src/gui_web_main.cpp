#include <cstdlib>
#include <ctime>

#include <emscripten/emscripten.h>

#include "engine/engine.h"
#include "gui/gui.h"
#include "ta-log.h"

namespace {

struct FurnaceGuiWebApp {
  DivEngine engine;
  FurnaceGUI gui;
  bool guiReady;
  bool engineReady;
  bool engineHadAudioError;
  bool safeMode;

  FurnaceGuiWebApp():
    guiReady(false),
    engineReady(false),
    engineHadAudioError(false),
    safeMode(false) {}
};

FurnaceGuiWebApp app;

void shutdownGuiWebApp() {
  if (app.guiReady) {
    logI("closing browser GUI");
    app.gui.finish(true);
    app.guiReady=false;
  }

  if (app.engineReady) {
    logI("stopping browser engine");
    app.engine.quit(false);
    app.engineReady=false;
  }

  finishLogFile();
  app.engine.everythingOK();
}

void runGuiFrame(void*) {
  if (!app.gui.loopFrame()) {
    emscripten_cancel_main_loop();
    shutdownGuiWebApp();
  }
}

}

extern "C" {

EMSCRIPTEN_KEEPALIVE
void furnace_gui_web_mouse_move(int x, int y, int xrel, int yrel) {
  if (!app.guiReady) return;
  app.gui.browserMouseMove(x,y,xrel,yrel);
}

EMSCRIPTEN_KEEPALIVE
void furnace_gui_web_mouse_down(int x, int y, int button) {
  if (!app.guiReady) return;
  app.gui.browserMouseDown(x,y,button);
}

EMSCRIPTEN_KEEPALIVE
void furnace_gui_web_mouse_up(int x, int y, int button) {
  if (!app.guiReady) return;
  app.gui.browserMouseUp(x,y,button);
}

EMSCRIPTEN_KEEPALIVE
void furnace_gui_web_mouse_wheel(float x, float y) {
  if (!app.guiReady) return;
  app.gui.browserMouseWheel(x,y);
}

EMSCRIPTEN_KEEPALIVE
void furnace_gui_web_mouse_leave() {
  if (!app.guiReady) return;
  app.gui.browserMouseLeave();
}

}

int main() {
  std::srand(static_cast<unsigned int>(std::time(nullptr)));
  initLog(stdout);

  app.engine.prePreInit();
  app.engine.setConsoleMode(false);
  app.engine.setAudio(DIV_AUDIO_SDL);

  app.safeMode=app.engine.preInit(false);
  if (app.safeMode) {
    app.gui.enableSafeMode();
  }

  if (!app.engine.init()) {
    logE("could not initialize engine audio backend");
    app.engineHadAudioError=true;
  }
  app.engineReady=true;

  app.gui.bindEngine(&app.engine);
  if (!app.gui.init()) {
    logE("%s",app.gui.getLastError().c_str());
    shutdownGuiWebApp();
    return 1;
  }
  app.guiReady=true;

  if (app.engineHadAudioError) {
    app.gui.showError(_("error while initializing audio!"));
  }

  if (!app.gui.beginLoop()) {
    logE("could not start GUI main loop");
    shutdownGuiWebApp();
    return 1;
  }

  emscripten_set_main_loop_arg(runGuiFrame,nullptr,0,true);
  return 0;
}
