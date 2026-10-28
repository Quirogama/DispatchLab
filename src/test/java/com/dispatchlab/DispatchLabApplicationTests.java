package com.dispatchlab;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DispatchLabApplicationTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void contextLoads() {
    }

    @Test
    void healthEndpointReportsServiceStatus() throws Exception {
        mockMvc.perform(get("/api/health"))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"status\":\"UP\"}"));
    }

    @Test
    void experimentsCanBeCreatedAndRetrieved() throws Exception {
        var payload = """
            {
              "seed": 90210,
              "durationSeconds": 180,
              "courierCount": 6,
              "results": [{
                "algorithm": "nearest",
                "couriers": 6,
                "delivered": 12,
                "waiting": 2,
                "pending": 4,
                "assigned": 14,
                "averageDistance": 8.5,
                "plannedAverageDistance": 8.9,
                "averagePickupTime": 12.2,
                "p95DeliveryTime": 75.0,
                "serviceLevel": 91.0,
                "utilization": 64.0,
                "rating": 4.7
              }]
            }
            """;

        var result = mockMvc.perform(post("/api/experiments")
                .contentType("application/json")
                .content(payload))
            .andExpect(status().isCreated())
            .andExpect(header().exists("Location"))
            .andExpect(jsonPath("$.id").isNotEmpty())
            .andExpect(jsonPath("$.results", hasSize(1)))
            .andReturn();

        var id = UUID.fromString(
            com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id")
        );

        mockMvc.perform(get("/api/experiments/{id}", id))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.seed").value(90210))
            .andExpect(jsonPath("$.results[0].algorithm").value("nearest"));
    }

    @Test
    void invalidExperimentIsRejected() throws Exception {
        mockMvc.perform(post("/api/experiments")
                .contentType("application/json")
                .content("""
                    {"seed": 1, "durationSeconds": 0, "courierCount": 2, "results": []}
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Request validation failed"))
            .andExpect(jsonPath("$.details", hasSize(2)));
    }
}
