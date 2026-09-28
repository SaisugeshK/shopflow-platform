package com.shopflow.common.api;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.Map;
import java.util.Set;

/**
 * Normalises 1-based page/pageSize/sort query parameters into a Spring {@link Pageable}.
 * Sort fields must be whitelisted by the caller so clients cannot sort on arbitrary columns.
 */
public final class PageQuery {

    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 100;

    private PageQuery() {
    }

    /**
     * @param sort          "field" or "field,desc"
     * @param allowedFields map of public sort name to entity property
     */
    public static Pageable of(Integer page, Integer pageSize, String sort, Map<String, String> allowedFields, Sort defaultSort) {
        int p = page == null || page < 1 ? 0 : page - 1;
        int size = pageSize == null || pageSize < 1 ? DEFAULT_PAGE_SIZE : Math.min(pageSize, MAX_PAGE_SIZE);
        return PageRequest.of(p, size, parseSort(sort, allowedFields, defaultSort));
    }

    public static Pageable of(Integer page, Integer pageSize) {
        return of(page, pageSize, null, Map.of(), Sort.unsorted());
    }

    static Sort parseSort(String sort, Map<String, String> allowedFields, Sort defaultSort) {
        if (sort == null || sort.isBlank()) {
            return defaultSort;
        }
        String[] parts = sort.split(",");
        String property = allowedFields.get(parts[0].trim());
        if (property == null) {
            return defaultSort;
        }
        boolean desc = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].trim());
        return Sort.by(desc ? Sort.Direction.DESC : Sort.Direction.ASC, property);
    }

    public static Map<String, String> fields(String... names) {
        java.util.HashMap<String, String> map = new java.util.HashMap<>();
        for (String name : names) {
            map.put(name, name);
        }
        return map;
    }

    public static final Set<String> EXPORT_FORMATS = Set.of("csv", "xlsx", "pdf");
}
