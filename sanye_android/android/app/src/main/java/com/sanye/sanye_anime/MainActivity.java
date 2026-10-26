package com.sanye.sanye_anime;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SanyeCatalogPlugin.class);
        registerPlugin(SanyeSourcePlugin.class);
        registerPlugin(SanyePlayerPlugin.class);
        registerPlugin(SanyeMedia3Plugin.class);
        registerPlugin(SanyeMediaFetchPlugin.class);
        registerPlugin(SanyeBackupFilesPlugin.class);
        registerPlugin(SanyeDownloadPlugin.class);
        registerPlugin(SanyeCoverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
