package com.raqkitchens.director;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RaqCameraPlugin.class);
        super.onCreate(savedInstanceState);
        // The director is used hands-free; the screen must not sleep mid-shot.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
