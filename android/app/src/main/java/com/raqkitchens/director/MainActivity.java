package com.raqkitchens.director;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RaqCameraPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
