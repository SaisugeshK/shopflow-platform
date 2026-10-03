package com.shopflow.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * Serves the React web build bundled into the jar under {@code classpath:/static/} (the single-image deployment
 * copies {@code web/dist} there at build time; see the repo-root Containerfile). Deep links such as
 * {@code /app/orders/123} are not real files, so a normal static handler would 404 on a browser reload; this
 * resolver falls back to {@code index.html} for any path that is not a real static file and not an API/docs/
 * actuator path, which keeps client-side routing working without a separate web server.
 * <p>
 * No-op when {@code static/index.html} is absent (local dev, where the web app runs on its own Vite server).
 */
@Configuration
public class SpaWebConfig implements WebMvcConfigurer {

    private static final String[] RESERVED_PREFIXES = {"api/", "actuator/", "swagger-ui/", "v3/api-docs"};

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        if (!new ClassPathResource("/static/index.html").exists()) {
            return;
        }
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource requested = location.createRelative(resourcePath);
                        if (requested.exists() && requested.isReadable()) {
                            return requested;
                        }
                        for (String prefix : RESERVED_PREFIXES) {
                            if (resourcePath.startsWith(prefix)) {
                                return null;
                            }
                        }
                        return new ClassPathResource("/static/index.html");
                    }
                });
    }
}
