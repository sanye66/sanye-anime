package com.sanye.sanye_anime;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * 真机冒烟用例：确认安装包用的是本项目的 applicationId。
 *
 * 模板残留的版本断言的是 `com.getcapacitor.app`，装到真机上必然失败；这里改为实际包名
 * （VQ-62）。用例只做这一件事：它需要在真机上跑，不引入与设备状态相关的额外假设。
 */
@RunWith(AndroidJUnit4.class)
public class SanyeApplicationInstrumentedTest {

    @Test
    public void usesProjectApplicationId() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        assertEquals("com.sanye.sanye_anime", appContext.getPackageName());
    }
}
