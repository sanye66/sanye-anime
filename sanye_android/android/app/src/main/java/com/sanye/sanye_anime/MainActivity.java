package com.sanye.sanye_anime;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SanyeCatalogPlugin.class);
        registerPlugin(SanyeSourcePlugin.class);
        registerPlugin(SanyePlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
