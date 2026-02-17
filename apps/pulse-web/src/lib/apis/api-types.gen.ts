export interface paths {
    "/api/v1/sender-profiles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Sender Profiles */
        get: {
            parameters: {
                query?: {
                    /** @description Expects a number. Defaults to 20. */
                    limit?: string;
                    /** @description Expects a number. Defaults to 0. */
                    offset?: string;
                    /** @description Expects avalid SortOrder schema. Defaults to asc. */
                    sortOrder?: string;
                    /** @description Expects avalid SortByTime schema. Defaults to createdAt. */
                    sortBy?: string;
                    /** @description Expects a string. */
                    key?: string;
                    /** @description Expects a boolean. */
                    isActive?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ListSenderProfileResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        /** Create Sender Profile */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CreateSenderProfileBody"];
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SenderProfileResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sender-profiles/{profileId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Sender Profile */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    profileId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SenderProfileResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Delete Sender Profile */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    profileId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Update Sender Profile */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    profileId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["UpdateSenderProfileBody"];
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SenderProfileResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/sender-profiles/{profileId}/endpoints": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Sender Endpoints */
        get: {
            parameters: {
                query?: {
                    /** @description Expects a number. Defaults to 20. */
                    limit?: string;
                    /** @description Expects a number. Defaults to 0. */
                    offset?: string;
                    /** @description Expects avalid SortOrder schema. Defaults to asc. */
                    sortOrder?: string;
                    /** @description Expects avalid SortByTime schema. Defaults to createdAt. */
                    sortBy?: string;
                    /** @description Expects avalid NotificationChannel schema. */
                    channel?: string;
                    /** @description Expects avalid NotificationServiceProvider schema. */
                    provider?: string;
                    /** @description Expects a boolean. */
                    isActive?: string;
                };
                header?: never;
                path: {
                    /** @description Expects a string. */
                    profileId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ListSenderEndpointResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        /** Create Sender Endpoint */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    profileId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CreateSenderEndpointBody"];
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SenderEndpointResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sender-profiles/{profileId}/endpoints/{endpointId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Sender Endpoint */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    profileId: string;
                    /** @description Expects a string. */
                    endpointId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SenderEndpointResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Delete Sender Endpoint */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    profileId: string;
                    /** @description Expects a string. */
                    endpointId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Update Sender Endpoint */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    profileId: string;
                    /** @description Expects a string. */
                    endpointId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["UpdateSenderEndpointBody"];
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SenderEndpointResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/sender-routing-rules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Sender Routing Rules */
        get: {
            parameters: {
                query?: {
                    /** @description Expects a number. Defaults to 20. */
                    limit?: string;
                    /** @description Expects a number. Defaults to 0. */
                    offset?: string;
                    /** @description Expects avalid SortOrder schema. Defaults to asc. */
                    sortOrder?: string;
                    /** @description Expects avalid SortByTime schema. Defaults to createdAt. */
                    sortBy?: string;
                    /** @description Expects avalid MessageType schema. */
                    messageType?: string;
                    /** @description Expects a string. */
                    region?: string;
                    /** @description Expects a string. */
                    serviceName?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ListSenderRoutingRuleResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        /** Create Sender Routing Rule */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CreateRoutingRuleBody"];
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SenderRoutingRuleResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sender-routing-rules/{routingRuleId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Sender Routing Rule */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    routingRuleId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SenderRoutingRuleDetailResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Delete Sender Routing Rule */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    routingRuleId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Update Sender Routing Rule */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    routingRuleId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["UpdateSenderRoutingRuleBody"];
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SenderRoutingRuleResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/dashboard/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Stats */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DashboardStats"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/template-groups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Template Groups */
        get: {
            parameters: {
                query?: {
                    /** @description Expects a number. Defaults to 20. */
                    limit?: string;
                    /** @description Expects a number. Defaults to 0. */
                    offset?: string;
                    /** @description Expects avalid SortOrder schema. Defaults to asc. */
                    sortOrder?: string;
                    /** @description Expects avalid SortByTime schema. Defaults to createdAt. */
                    sortBy?: string;
                    /** @description Expects a string. */
                    key?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ListTemplateGroupResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        /** Create Template Group */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CreateTemplateGroupBody"];
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TemplateGroupResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/template-groups/{groupId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Template Group */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    groupId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TemplateGroupResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Template Group */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    groupId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["UpdateTemplateGroupBody"];
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TemplateGroupResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/template-groups/{groupId}/variants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Template Variants */
        get: {
            parameters: {
                query?: {
                    /** @description Expects a number. Defaults to 20. */
                    limit?: string;
                    /** @description Expects a number. Defaults to 0. */
                    offset?: string;
                    /** @description Expects avalid SortOrder schema. Defaults to asc. */
                    sortOrder?: string;
                    /** @description Expects avalid SortByTime schema. Defaults to createdAt. */
                    sortBy?: string;
                    /** @description Expects avalid NotificationChannel schema. */
                    channel?: string;
                    /** @description Expects a string. */
                    locale?: string;
                };
                header?: never;
                path: {
                    /** @description Expects a string. */
                    groupId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ListTemplateVariantResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        /** Create Template Variant */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    groupId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CreateTemplateVariantBody"];
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TemplateVariantResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/template-groups/{groupId}/variants/{variantId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Template Variant */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    groupId: string;
                    /** @description Expects a string. */
                    variantId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TemplateVariantResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Delete Template Variant */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    groupId: string;
                    /** @description Expects a string. */
                    variantId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Update Template Variant */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Expects a string. */
                    groupId: string;
                    /** @description Expects a string. */
                    variantId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["UpdateTemplateVariantBody"];
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TemplateVariantResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Notification */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["CreateNotificationBody"];
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CreateNotificationResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Messages */
        get: {
            parameters: {
                query?: {
                    /** @description Expects a number. Defaults to 20. */
                    limit?: string;
                    /** @description Expects a number. Defaults to 0. */
                    offset?: string;
                    /** @description Expects avalid SortOrder schema. Defaults to asc. */
                    sortOrder?: string;
                    /** @description Expects avalid SortByCreatedAt schema. Defaults to createdAt. */
                    sortBy?: string;
                    /** @description Expects avalid NotificationChannel schema. */
                    channel?: string;
                    /** @description Expects a string. */
                    recipient?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ListNotificationMessagesResponse"];
                    };
                };
                /** @description Default Response */
                "4XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
                /** @description Default Response */
                "5XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponseDto"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        CreateSenderProfileBody: {
            key: string;
            displayName?: string;
            isActive?: boolean;
        };
        SenderProfileResponse: {
            key: string;
            displayName?: string;
            id: string;
            isActive: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ErrorResponseDto: {
            code: string;
            type: string;
            message: string;
            fields?: components["schemas"]["ErrorFieldDto"][];
        };
        ErrorFieldDto: {
            field: string;
            msg: string;
        };
        /** @enum {string} */
        SortOrder: "asc" | "desc";
        /** @enum {string} */
        SortByTime: "createdAt" | "updatedAt";
        ListSenderProfileResponse: {
            total: number;
            limit: number;
            offset: number;
            items: components["schemas"]["SenderProfileResponse"][];
        };
        UpdateSenderProfileBody: {
            displayName?: string;
            isActive?: boolean;
        };
        CreateSenderEndpointBody: {
            channel: components["schemas"]["NotificationChannel"];
            provider: components["schemas"]["NotificationServiceProvider"];
            identifier: string;
            weight?: number;
            isActive?: boolean;
        };
        /** @enum {string} */
        NotificationChannel: "EMAIL" | "SMS" | "PUSH";
        /** @enum {string} */
        NotificationServiceProvider: "DEV" | "SENDGRID" | "TWILIO" | "FIREBASE" | "AWS_SES";
        SenderEndpointResponse: {
            channel: components["schemas"]["NotificationChannel"];
            provider: components["schemas"]["NotificationServiceProvider"];
            identifier: string;
            id: string;
            senderProfileId: string;
            weight: number;
            isActive: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ListSenderEndpointResponse: {
            total: number;
            limit: number;
            offset: number;
            items: components["schemas"]["SenderEndpointResponse"][];
        };
        UpdateSenderEndpointBody: {
            identifier?: string;
            weight?: number;
            isActive?: boolean;
        };
        CreateRoutingRuleBody: {
            senderProfileId: string;
            messageType?: components["schemas"]["MessageType"];
            region?: string;
            service?: string;
        };
        /** @enum {string} */
        MessageType: "OTP" | "TRANSACTIONAL" | "PROMOTIONAL";
        SenderRoutingRuleResponse: {
            senderProfileId: string;
            messageType?: components["schemas"]["MessageType"];
            region?: string;
            service?: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ListSenderRoutingRuleResponse: {
            total: number;
            limit: number;
            offset: number;
            items: components["schemas"]["SenderRoutingRuleResponse"][];
        };
        SenderRoutingRuleDetailResponse: {
            senderProfileId: string;
            messageType?: components["schemas"]["MessageType"];
            region?: string;
            service?: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            profile: components["schemas"]["SenderProfileResponse"];
        };
        UpdateSenderRoutingRuleBody: {
            senderProfileId: string;
        };
        DashboardStats: {
            today: components["schemas"]["NotificationStats"];
            trend: components["schemas"]["NotificationStatsTrend"];
        };
        NotificationStats: {
            date: string;
            overall: components["schemas"]["NotificationDeliveryStats"];
            channels: components["schemas"]["NotificationChannelStats"];
        };
        NotificationDeliveryStats: {
            total: number;
            succeeded: number;
            failed: number;
            pending: number;
        };
        NotificationChannelStats: {
            email: components["schemas"]["NotificationDeliveryStats"];
            sms: components["schemas"]["NotificationDeliveryStats"];
            push: components["schemas"]["NotificationDeliveryStats"];
        };
        NotificationStatsTrend: {
            fromDate: string;
            toDate: string;
            stats: components["schemas"]["NotificationStatsWithDate"][];
        };
        NotificationStatsWithDate: {
            total: number;
            succeeded: number;
            failed: number;
            pending: number;
            date: string;
        };
        CreateTemplateGroupBody: {
            templateKey: string;
            messageType: components["schemas"]["MessageType"];
            description?: string;
            priority?: components["schemas"]["Priority"];
            isActive?: boolean;
        };
        /** @enum {string} */
        Priority: "LOW" | "MEDIUM" | "HIGH";
        TemplateGroupResponse: {
            templateKey: string;
            messageType: components["schemas"]["MessageType"];
            description?: string;
            priority?: components["schemas"]["Priority"];
            isActive?: boolean;
            id: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ListTemplateGroupResponse: {
            total: number;
            limit: number;
            offset: number;
            items: components["schemas"]["TemplateGroupResponse"][];
        };
        UpdateTemplateGroupBody: {
            messageType?: components["schemas"]["MessageType"];
            description?: string;
            priority?: components["schemas"]["Priority"];
            isActive?: boolean;
        };
        ListTemplateVariantResponse: {
            total: number;
            limit: number;
            offset: number;
            items: components["schemas"]["TemplateVariantResponse"][];
        };
        TemplateVariantResponse: {
            channel: components["schemas"]["NotificationChannel"];
            locale: string;
            subject?: string;
            body: string;
            isActive: boolean;
            id: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        CreateTemplateVariantBody: {
            channel: components["schemas"]["NotificationChannel"];
            locale: string;
            subject?: string;
            body: string;
            isActive: boolean;
        };
        UpdateTemplateVariantBody: {
            subject?: string;
            body?: string;
            isActive?: boolean;
        };
        CreateNotificationBody: {
            templateKey: string;
            recipients: components["schemas"]["NotificationRecipients"];
            payload?: Record<string, never>;
            locale?: string;
            service?: string;
        };
        NotificationRecipients: {
            email?: string;
            phone?: string;
            push?: string;
        };
        CreateNotificationResponse: {
            /** @enum {string} */
            status: "ACCEPTED" | "PARTIAL_ACCEPTED" | "FAILED";
            channelResults: components["schemas"]["NotificationChannelResponse"][];
        };
        NotificationChannelResponse: {
            channel: components["schemas"]["NotificationChannel"];
            /** @enum {string} */
            status: "QUEUED" | "FAILED";
            locale?: string;
            jobId?: string;
            error?: components["schemas"]["ErrorResponseDto"];
        };
        /** @enum {string} */
        SortByCreatedAt: "createdAt";
        ListNotificationMessagesResponse: {
            total: number;
            limit: number;
            offset: number;
            items: components["schemas"]["NotificationMessageResponse"][];
        };
        NotificationMessageResponse: {
            id: string;
            channel: components["schemas"]["NotificationChannel"];
            recipient: string;
            locale: string;
            renderedSubject?: string;
            renderedBody: string;
            payload?: {
                [key: string]: unknown;
            };
            templateKey: string;
            messageType: components["schemas"]["MessageType"];
            /** Format: date-time */
            createdAt: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
export type CreateSenderProfileBody = components['schemas']['CreateSenderProfileBody']
export type SenderProfileResponse = components['schemas']['SenderProfileResponse']
export type ErrorResponseDto = components['schemas']['ErrorResponseDto']
export type ErrorFieldDto = components['schemas']['ErrorFieldDto']
export type SortOrder = components['schemas']['SortOrder']
export type SortByTime = components['schemas']['SortByTime']
export type ListSenderProfileResponse = components['schemas']['ListSenderProfileResponse']
export type UpdateSenderProfileBody = components['schemas']['UpdateSenderProfileBody']
export type CreateSenderEndpointBody = components['schemas']['CreateSenderEndpointBody']
export type NotificationChannel = components['schemas']['NotificationChannel']
export type NotificationServiceProvider = components['schemas']['NotificationServiceProvider']
export type SenderEndpointResponse = components['schemas']['SenderEndpointResponse']
export type ListSenderEndpointResponse = components['schemas']['ListSenderEndpointResponse']
export type UpdateSenderEndpointBody = components['schemas']['UpdateSenderEndpointBody']
export type CreateRoutingRuleBody = components['schemas']['CreateRoutingRuleBody']
export type MessageType = components['schemas']['MessageType']
export type SenderRoutingRuleResponse = components['schemas']['SenderRoutingRuleResponse']
export type ListSenderRoutingRuleResponse = components['schemas']['ListSenderRoutingRuleResponse']
export type SenderRoutingRuleDetailResponse = components['schemas']['SenderRoutingRuleDetailResponse']
export type UpdateSenderRoutingRuleBody = components['schemas']['UpdateSenderRoutingRuleBody']
export type DashboardStats = components['schemas']['DashboardStats']
export type NotificationStats = components['schemas']['NotificationStats']
export type NotificationDeliveryStats = components['schemas']['NotificationDeliveryStats']
export type NotificationChannelStats = components['schemas']['NotificationChannelStats']
export type NotificationStatsTrend = components['schemas']['NotificationStatsTrend']
export type NotificationStatsWithDate = components['schemas']['NotificationStatsWithDate']
export type CreateTemplateGroupBody = components['schemas']['CreateTemplateGroupBody']
export type Priority = components['schemas']['Priority']
export type TemplateGroupResponse = components['schemas']['TemplateGroupResponse']
export type ListTemplateGroupResponse = components['schemas']['ListTemplateGroupResponse']
export type UpdateTemplateGroupBody = components['schemas']['UpdateTemplateGroupBody']
export type ListTemplateVariantResponse = components['schemas']['ListTemplateVariantResponse']
export type TemplateVariantResponse = components['schemas']['TemplateVariantResponse']
export type CreateTemplateVariantBody = components['schemas']['CreateTemplateVariantBody']
export type UpdateTemplateVariantBody = components['schemas']['UpdateTemplateVariantBody']
export type CreateNotificationBody = components['schemas']['CreateNotificationBody']
export type NotificationRecipients = components['schemas']['NotificationRecipients']
export type CreateNotificationResponse = components['schemas']['CreateNotificationResponse']
export type NotificationChannelResponse = components['schemas']['NotificationChannelResponse']
export type SortByCreatedAt = components['schemas']['SortByCreatedAt']
export type ListNotificationMessagesResponse = components['schemas']['ListNotificationMessagesResponse']
export type NotificationMessageResponse = components['schemas']['NotificationMessageResponse']
export type ListSenderProfilesQueryParams = Exclude<paths['/api/v1/sender-profiles']['get']['parameters']['query'], undefined>;
export type GetSenderProfilePathParams = Exclude<paths['/api/v1/sender-profiles/{profileId}']['get']['parameters']['path'], undefined>;
export type ListSenderEndpointsQueryParams = Exclude<paths['/api/v1/sender-profiles/{profileId}/endpoints']['get']['parameters']['query'], undefined>;
export type ListSenderEndpointsPathParams = Exclude<paths['/api/v1/sender-profiles/{profileId}/endpoints']['get']['parameters']['path'], undefined>;
export type GetSenderEndpointPathParams = Exclude<paths['/api/v1/sender-profiles/{profileId}/endpoints/{endpointId}']['get']['parameters']['path'], undefined>;
export type ListSenderRoutingRulesQueryParams = Exclude<paths['/api/v1/sender-routing-rules']['get']['parameters']['query'], undefined>;
export type GetSenderRoutingRulePathParams = Exclude<paths['/api/v1/sender-routing-rules/{routingRuleId}']['get']['parameters']['path'], undefined>;
export type ListTemplateGroupsQueryParams = Exclude<paths['/api/v1/template-groups']['get']['parameters']['query'], undefined>;
export type GetTemplateGroupPathParams = Exclude<paths['/api/v1/template-groups/{groupId}']['get']['parameters']['path'], undefined>;
export type ListTemplateVariantsQueryParams = Exclude<paths['/api/v1/template-groups/{groupId}/variants']['get']['parameters']['query'], undefined>;
export type ListTemplateVariantsPathParams = Exclude<paths['/api/v1/template-groups/{groupId}/variants']['get']['parameters']['path'], undefined>;
export type GetTemplateVariantPathParams = Exclude<paths['/api/v1/template-groups/{groupId}/variants/{variantId}']['get']['parameters']['path'], undefined>;
export type ListMessagesQueryParams = Exclude<paths['/api/v1/notifications/messages']['get']['parameters']['query'], undefined>;
