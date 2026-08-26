package com.sanye.anime.sanye_core.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = WebTestConfig.class)
@AutoConfigureMockMvc
class HttpContractTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void pingReturnsContractAndEchoesRequestId() throws Exception {
        mockMvc.perform(get("/api/v1/system/ping").header("X-Request-Id", "rid-contract"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.pong").value(true))
                .andExpect(jsonPath("$.requestId").value("rid-contract"))
                .andExpect(result -> org.assertj.core.api.Assertions.assertThat(
                        result.getResponse().getHeader("X-Request-Id")).isEqualTo("rid-contract"));
    }

    @Test
    void businessErrorMapsToErrorCode() throws Exception {
        mockMvc.perform(get("/test/business"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(3001));
    }

    @Test
    void unknownErrorMapsTo5001() throws Exception {
        mockMvc.perform(get("/test/unknown"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(5001));
    }
}
