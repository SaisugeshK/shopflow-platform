package com.shopflow.support;

import com.shopflow.common.util.MobileNumbers;
import com.shopflow.integrations.otp.MockOtpProvider;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Thin MockMvc client: JSON in, {@link JsonNode} out, with status assertions.
 */
@TestComponent
public class TestApi {

    private final MockMvc mvc;
    private final ObjectMapper mapper;
    private final MockOtpProvider otp;

    public TestApi(MockMvc mvc, ObjectMapper mapper, MockOtpProvider otp) {
        this.mvc = mvc;
        this.mapper = mapper;
        this.otp = otp;
    }

    public String login(String mobile) {
        JsonNode challenge = post("/api/v1/auth/otp/request", null, Map.of("mobileNumber", mobile), 200).path("data");
        String code = otp.latestFor(MobileNumbers.normalize(mobile)).orElseThrow();
        JsonNode verified = post("/api/v1/auth/otp/verify", null, Map.of("mobileNumber", mobile, "otp", code,
                "requestId", challenge.path("requestId").asString()), 200).path("data");
        return verified.path("accessToken").asString();
    }

    public JsonNode get(String path, String token, int expectedStatus) {
        return exchange(HttpMethod.GET, path, token, null, expectedStatus, Map.of());
    }

    public JsonNode post(String path, String token, Object body, int expectedStatus) {
        return exchange(HttpMethod.POST, path, token, body, expectedStatus, Map.of());
    }

    public JsonNode post(String path, String token, Object body, int expectedStatus, Map<String, String> headers) {
        return exchange(HttpMethod.POST, path, token, body, expectedStatus, headers);
    }

    public JsonNode patch(String path, String token, Object body, int expectedStatus) {
        return exchange(HttpMethod.PATCH, path, token, body, expectedStatus, Map.of());
    }

    public JsonNode delete(String path, String token, int expectedStatus) {
        return exchange(HttpMethod.DELETE, path, token, null, expectedStatus, Map.of());
    }

    public byte[] raw(String path, String token, int expectedStatus) {
        try {
            MockHttpServletRequestBuilder req = MockMvcRequestBuilders.get(path);
            if (token != null) {
                req.header("Authorization", "Bearer " + token);
            }
            MvcResult r = mvc.perform(req).andReturn();
            assertThat(r.getResponse().getStatus()).as("GET %s", path).isEqualTo(expectedStatus);
            return r.getResponse().getContentAsByteArray();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public JsonNode exchange(HttpMethod method, String path, String token, Object body, int expectedStatus, Map<String, String> headers) {
        try {
            MockHttpServletRequestBuilder req = MockMvcRequestBuilders.request(method, path).contentType(MediaType.APPLICATION_JSON);
            if (token != null) {
                req.header("Authorization", "Bearer " + token);
            }
            headers.forEach(req::header);
            if (body != null) {
                req.content(body instanceof String s ? s : mapper.writeValueAsString(body));
            }
            MvcResult r = mvc.perform(req).andReturn();
            String content = r.getResponse().getContentAsString();
            assertThat(r.getResponse().getStatus()).as("%s %s -> %s", method, path, content).isEqualTo(expectedStatus);
            return content.isEmpty() ? mapper.createObjectNode() : mapper.readTree(content);
        } catch (AssertionError e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public ObjectMapper mapper() {
        return mapper;
    }
}
