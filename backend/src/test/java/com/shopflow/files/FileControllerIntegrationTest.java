package com.shopflow.files;

import com.shopflow.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Product images must be viewable by a plain {@code <img>} tag, which cannot send a bearer token — so
 * {@code /api/v1/files/public/**} must stay reachable without authentication (§71). A gap here previously left every
 * uploaded image unviewable; found by testing the real upload-then-view path end to end against a live deployment.
 */
class FileControllerIntegrationTest extends IntegrationTest {

    @Autowired
    MockMvc mvc;

    @Test
    void uploadedProductImageIsViewableWithoutAuthentication() throws Exception {
        String ownerToken = api.login(data.owner());
        String productId = data.product("20", "10", "18", "0").toString();

        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
        MockMultipartFile file = new MockMultipartFile("file", "logo.png", MediaType.IMAGE_PNG_VALUE, png);
        MvcResult upload = mvc.perform(MockMvcRequestBuilders.multipart("/api/v1/products/" + productId + "/images")
                        .file(file).header("Authorization", "Bearer " + ownerToken))
                .andReturn();
        assertThat(upload.getResponse().getStatus()).as(upload.getResponse().getContentAsString()).isEqualTo(201);
        String fileId = api.mapper().readTree(upload.getResponse().getContentAsString()).path("data").path("fileId").asString();

        byte[] viewed = api.raw("/api/v1/files/public/" + fileId, null, 200);
        assertThat(viewed).isEqualTo(png);
    }

    @Test
    void nonExistentFileIsNotFoundAnonymously() {
        // The endpoint must reject this without requiring a bearer token first — proves the security matcher lets
        // the request reach the controller, which then does its own not-found/purpose check.
        api.raw("/api/v1/files/public/" + UUID.randomUUID(), null, 404);
    }
}
