import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  transform,
  exploreSpace,
  importData,
  uploadTextToSpace,
  exportSpace,
  clearSpace,
  deleteToken,
  deleteTokens,
  fetchTokens,
  refreshCodes,
  createToken,
} from "../api";
import type { Mm2Input } from "../types";

// Mock the global fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSuccessResponse = (body: any, contentType = "application/json") =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": contentType },
  });

const mockErrorResponse = (message: string, status: number) =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const mockPlainTextResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain" } });

const buildExpectedUrl = (endpoint: string, path: string) =>
  `http://localhost:8000${endpoint}${path.replace(/^\/+|\/+$/g, "")}`;

describe("API Tests: Transform Page", () => {
  beforeEach(() => {
    // Mock the environment variable
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "200003ee-c651-4069-8b7f-2ad9fb46c3ab"),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("transform", () => {
    const mockPath = "/path/";
    const mockTransformation: Mm2Input = {
      pattern: ["(A $x)"],
      template: ["(B $x)"],
    };

    it("should send a POST request with the correct transformation data", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      await transform(mockPath, mockTransformation);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url.toString()).toBe(
        buildExpectedUrl("/spaces/transform/", mockPath) + "/"
      );
      expect(options?.method).toBe("POST");
      expect(options?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );
      expect(options?.body).toBe(
        JSON.stringify({
          patterns: mockTransformation.pattern,
          templates: mockTransformation.template,
        })
      );
    });

    it("should return true on a successful transformation", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      const result = await transform(mockPath, mockTransformation);

      expect(result).toBe(true);
    });

    it("should throw an error on network failure", async () => {
      const networkError = new TypeError("Failed to fetch");
      mockFetch.mockRejectedValue(networkError);

      await expect(transform(mockPath, mockTransformation)).rejects.toThrow(
        networkError
      );
    });
    it("should handle unauthorized access (401)", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Unauthorized", 401));

      await expect(transform(mockPath, mockTransformation)).rejects.toThrow(
        "Unauthorized"
      );
    });

    it("should handle forbidden access (403)", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Forbidden", 403));

      await expect(transform(mockPath, mockTransformation)).rejects.toThrow(
        "Forbidden"
      );
    });

    it("should handle server errors (500)", async () => {
      mockFetch.mockResolvedValue(
        mockPlainTextResponse("Internal Server Error", 500)
      );

      await expect(transform(mockPath, mockTransformation)).rejects.toThrow(
        "Internal Server Error"
      );
    });

    it("should handle MORK server communication errors (502)", async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse("MORK server unreachable", 502)
      );

      await expect(transform(mockPath, mockTransformation)).rejects.toThrow(
        "MORK server unreachable"
      );
    });

    it("should handle multiple patterns and templates", async () => {
      const multiTransformation: Mm2Input = {
        pattern: ["(A $x)", "(B $y)"],
        template: ["(C $x)", "(D $y)"],
      };
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      const result = await transform(mockPath, multiTransformation);

      expect(result).toBe(true);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options?.body as string);
      expect(body.patterns).toHaveLength(2);
      expect(body.templates).toHaveLength(2);
    });

    it("should handle complex nested patterns", async () => {
      const complexTransformation: Mm2Input = {
        pattern: ["(parent $x $y)", "(grandparent $x $z)"],
        template: ["(ancestor $x $y)", "(ancestor $x $z)"],
      };
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      await transform(mockPath, complexTransformation);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options?.body as string);
      expect(body.patterns[0]).toBe("(parent $x $y)");
      expect(body.templates[0]).toBe("(ancestor $x $y)");
    });

    it("should handle empty patterns array", async () => {
      const emptyTransformation: Mm2Input = {
        pattern: [],
        template: [],
      };
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      const result = await transform(mockPath, emptyTransformation);

      expect(result).toBe(true);
    });

    it("should handle special characters in patterns", async () => {
      const specialTransformation: Mm2Input = {
        pattern: ["(test $x)"],
        template: ["(result $x)"],
      };
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      await transform(mockPath, specialTransformation);

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toContain("/spaces");
    });

    it("should handle different namespace paths", async () => {
      const mockPath = "/user/data/test/";
      const namespacedTransformation: Mm2Input = {
        pattern: ["$x"],
        template: ["$x"],
      };
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      await transform(mockPath, namespacedTransformation);

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toBe(
        "http://localhost:8000/spaces/transform/user/data/test/"
      );
    });

    it("should handle root namespace", async () => {
      const rootTransformation: Mm2Input = {
        pattern: ["$x"],
        template: ["$x"],
      };
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      await transform("/", rootTransformation);

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toBe("http://localhost:8000/spaces/transform/");
    });

    it("should include authorization header in request", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      await transform(mockPath, mockTransformation);

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toHaveProperty("Authorization");
    });

    it("should handle malformed JSON response", async () => {
      mockFetch.mockResolvedValue(
        new Response("not valid json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await expect(transform(mockPath, mockTransformation)).rejects.toThrow(
        "not valid json"
      );
    });
  });
});

describe("API Tests: Upload Page", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "200003ee-c651-4069-8b7f-2ad9fb46c3ab"),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("uploadTextToSpace", () => {
    const mockPath = "/user/data/";
    const mockData = "(fact 0 1)\n(fact 1 1)\n(fact 2 2)";

    it("should send a POST request with text/plain content type", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse("Upload successful"));

      await uploadTextToSpace(mockPath, mockData);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url.toString()).toBe(
        buildExpectedUrl("/spaces/upload/", mockPath) + "/"
      );
      expect(options?.method).toBe("POST");
      expect(options?.headers).toHaveProperty("Content-Type", "text/plain");
      expect(options?.body).toBe(mockData);
    });

    it("should include authorization token when available", async () => {
      const mockToken = "200003ee-c651-4069-8b7f-2ad9fb46c3ab";
      vi.stubGlobal("localStorage", {
        getItem: vi.fn(() => mockToken),
        setItem: vi.fn(),
      });

      mockFetch.mockResolvedValue(mockSuccessResponse("Upload successful"));

      await uploadTextToSpace(mockPath, mockData);

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toHaveProperty("Authorization", mockToken);
    });

    it("should return the response text on success", async () => {
      const successMessage = "Data uploaded successfully";
      mockFetch.mockResolvedValue(mockSuccessResponse(successMessage));

      const result = await uploadTextToSpace(mockPath, mockData);

      expect(result).toBe(successMessage);
    });

    it("should throw an error when the API returns a non-ok response", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Unauthorized", 401));

      await expect(uploadTextToSpace(mockPath, mockData)).rejects.toThrow(
        "Unauthorized"
      );
    });

    it("should throw an error on network failure", async () => {
      const networkError = new TypeError("Failed to fetch");
      mockFetch.mockRejectedValue(networkError);

      await expect(uploadTextToSpace(mockPath, mockData)).rejects.toThrow(
        networkError
      );
    });

    it("should handle empty path correctly", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse("Upload successful"));

      await uploadTextToSpace("/", mockData);

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toBe(buildExpectedUrl("/spaces/upload/", "/"));
    });
  });

  describe("importData - Text Import", () => {
    const mockTextData = "(test data)";

    it("should upload text data with default metta format", async () => {
      const successResponse = "Text imported successfully";
      mockFetch.mockResolvedValue(mockPlainTextResponse(successResponse));

      const result = await importData("text", mockTextData);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url.toString()).toContain("/upload/");
      expect(url.toString()).toContain("format=metta");
      expect(options?.method).toBe("POST");
      expect(options?.headers).toHaveProperty("Content-Type", "text/plain");
      expect(options?.body).toBe(mockTextData);
      expect(result).toEqual({
        status: "success",
        data: successResponse,
        message: "Text imported successfully",
      });
    });

    it("should support custom format parameter", async () => {
      mockFetch.mockResolvedValue(mockPlainTextResponse("Success"));

      await importData("text", mockTextData, "json");

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toContain("format=json");
    });

    it("should include authorization token", async () => {
      const mockToken = "200003ee-c651-4069-8b7f-2ad9fb46c3ab";
      vi.stubGlobal("localStorage", { getItem: vi.fn(() => mockToken) });

      mockFetch.mockResolvedValue(mockPlainTextResponse("Success"));

      await importData("text", mockTextData);

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toHaveProperty("Authorization", mockToken);
    });

    it("should return error response when upload fails", async () => {
      mockFetch.mockResolvedValue(mockPlainTextResponse("Upload failed", 500));

      const result = await importData("text", mockTextData);

      expect(result).toEqual({
        status: "error",
        message: "Upload failed",
      });
    });

    it("should properly encode pattern and template in URL", async () => {
      mockFetch.mockResolvedValue(mockPlainTextResponse("Success"));

      await importData("text", mockTextData);

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toContain(encodeURIComponent("$x"));
    });
  });

  describe("importData - File Import", () => {
    it("should return error for unimplemented file upload", async () => {
      const result = await importData("file", null);

      expect(result).toEqual({
        status: "error",
        message: "File upload not implemented yet",
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("importData - Error Handling", () => {
    const mockTextData = "(test data)";

    it("should handle unsupported import type", async () => {
      const result = await importData("unsupported", mockTextData);

      expect(result).toEqual({
        status: "error",
        message: "Unsupported import type: unsupported",
      });
    });

    it("should handle network errors gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await importData("text", mockTextData);

      expect(result).toEqual({
        status: "error",
        message: "Network error",
      });
    });

    it("should handle non-Error exceptions", async () => {
      mockFetch.mockRejectedValue("String error");

      const result = await importData("text", mockTextData);

      expect(result).toEqual({
        status: "error",
        message: "Failed to import data",
      });
    });
  });
});

describe("API Tests: Export Page", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "200003ee-c651-4069-8b7f-2ad9fb46c3ab"),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("exportSpace", () => {
    const mockPath = "/user/data/";
    const mockExportInput: Mm2Input = {
      pattern: "$x",
      template: "$x",
    };

    it("should send a POST request with the correct export data", async () => {
      const mockResponse = "(fact 0 1)\n(fact 1 1)\n(fact 2 2)";
      mockFetch.mockResolvedValue(mockSuccessResponse(mockResponse));

      await exportSpace(mockPath, mockExportInput);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url.toString()).toBe(
        buildExpectedUrl("/spaces/export/", mockPath) + "/"
      );
      expect(options?.method).toBe("POST");
      expect(options?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );
      expect(options?.body).toBe(JSON.stringify(mockExportInput));
    });

    it("should include authorization token when available", async () => {
      const mockToken = "200003ee-c651-4069-8b7f-2ad9fb46c3ab";
      vi.stubGlobal("localStorage", { getItem: vi.fn(() => mockToken) });

      mockFetch.mockResolvedValue(mockSuccessResponse("()"));

      await exportSpace(mockPath, mockExportInput);

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toHaveProperty("Authorization", mockToken);
    });

    it("should return the exported data as a string on success", async () => {
      const exportedData = "(fact 1 2)\n(fact 2 3)\n(fact 3 5)";
      mockFetch.mockResolvedValue(mockSuccessResponse(exportedData));

      const result = await exportSpace(mockPath, mockExportInput);

      expect(result).toBe(exportedData);
    });

    it("should handle complex pattern and template expressions", async () => {
      const complexExportInput: Mm2Input = {
        pattern: "(fact $x $y)",
        template: "(result $x $y)",
      };

      mockFetch.mockResolvedValue(mockSuccessResponse("(result 1 2)"));

      await exportSpace(mockPath, complexExportInput);

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.body).toBe(JSON.stringify(complexExportInput));
    });

    it("should handle empty export results", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse("()"));

      const result = await exportSpace(mockPath, mockExportInput);

      expect(result).toBe("()");
    });

    it("should throw an error when the API returns a non-ok response", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Unauthorized", 401));

      await expect(exportSpace(mockPath, mockExportInput)).rejects.toThrow(
        "Unauthorized"
      );
    });

    it("should throw an error when pattern is missing", async () => {
      const invalidInput: Mm2Input = {
        pattern: "",
        template: "$x",
      };

      mockFetch.mockResolvedValue(mockErrorResponse("Invalid pattern", 400));

      await expect(exportSpace(mockPath, invalidInput)).rejects.toThrow(
        "Invalid pattern"
      );
    });

    it("should throw an error on network failure", async () => {
      const networkError = new TypeError("Failed to fetch");
      mockFetch.mockRejectedValue(networkError);

      await expect(exportSpace(mockPath, mockExportInput)).rejects.toThrow(
        networkError
      );
    });

    it("should handle root path correctly", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse("()"));

      await exportSpace("/", mockExportInput);

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toBe(buildExpectedUrl("/spaces/export/", "/"));
    });

    it("should handle nested namespace paths", async () => {
      const nestedPath = "/user/data/subfolder/";
      mockFetch.mockResolvedValue(mockSuccessResponse("()"));

      await exportSpace(nestedPath, mockExportInput);

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toBe(
        buildExpectedUrl("/spaces/export/", nestedPath) + "/"
      );
    });

    it("should handle JSON response when content-type is application/json", async () => {
      const jsonResponse = { data: "(fact 1 2)" };
      mockFetch.mockResolvedValue(mockSuccessResponse(jsonResponse));

      const result = await exportSpace(mockPath, mockExportInput);

      expect(result).toEqual(jsonResponse);
    });

    it("should handle server errors with proper error messages", async () => {
      mockFetch.mockResolvedValue(
        mockPlainTextResponse("Internal Server Error", 500)
      );

      await expect(exportSpace(mockPath, mockExportInput)).rejects.toThrow(
        "Internal Server Error"
      );
    });
  });
});

describe("API Tests: Clear Page", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "200003ee-c651-4069-8b7f-2ad9fb46c3ab"),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("clearSpace", () => {
    const mockPath = "/user/data/";

    it("should send a POST request to the correct clear endpoint", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      await clearSpace(mockPath);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url.toString()).toBe(
        buildExpectedUrl("/spaces/clear/", mockPath) + "/?expr=$x"
      );
      expect(options?.method).toBe("POST");
    });

    it("should include authorization token when available", async () => {
      const mockToken = "200003ee-c651-4069-8b7f-2ad9fb46c3ab";
      vi.stubGlobal("localStorage", { getItem: vi.fn(() => mockToken) });

      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      await clearSpace(mockPath);

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toHaveProperty("Authorization", mockToken);
    });

    it("should return true on successful clear operation", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      const result = await clearSpace(mockPath);

      expect(result).toBe(true);
    });

    it("should handle root path correctly", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      await clearSpace("/");

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toBe(
        buildExpectedUrl("/spaces/clear/", "/") + "?expr=$x"
      );
    });

    it("should handle nested namespace paths", async () => {
      const nestedPath = "/user/data/subfolder/";
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      await clearSpace(nestedPath);

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toBe(
        buildExpectedUrl("/spaces/clear/", nestedPath) + "/?expr=$x"
      );
    });

    it("should throw an error when the API returns unauthorized response", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Unauthorized", 401));

      await expect(clearSpace(mockPath)).rejects.toThrow("Unauthorized");
    });

    it("should throw an error when user lacks write permission", async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse("Forbidden - Write permission required", 403)
      );

      await expect(clearSpace(mockPath)).rejects.toThrow(
        "Forbidden - Write permission required"
      );
    });

    it("should throw an error on network failure", async () => {
      const networkError = new TypeError("Failed to fetch");
      mockFetch.mockRejectedValue(networkError);

      await expect(clearSpace(mockPath)).rejects.toThrow(networkError);
    });

    it("should handle server errors with proper error messages", async () => {
      mockFetch.mockResolvedValue(
        mockPlainTextResponse("Internal Server Error", 500)
      );

      await expect(clearSpace(mockPath)).rejects.toThrow(
        "Internal Server Error"
      );
    });

    it("should handle MORK server communication errors", async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse("MORK server unreachable", 502)
      );

      await expect(clearSpace(mockPath)).rejects.toThrow(
        "MORK server unreachable"
      );
    });

    it("should handle empty path by defaulting to root", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse(true));

      await clearSpace("");

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toBe("http://localhost:8000/spaces/clear?expr=$x");
    });
  });
});

describe("API Tests: Load Page - Explore Endpoint", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "200003ee-c651-4069-8b7f-2ad9fb46c3ab"),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("exploreSpace", () => {
    const mockPath = "/user/data/";
    const mockPattern = "$x";
    const mockToken = new Uint8Array([1, 2, 3, 4]);

    it("should send a POST request with the correct explore data", async () => {
      const mockResponse = [
        { expr: "(fact 0 1)", token: [1, 2, 3] },
        { expr: "(fact 1 1)", token: [1, 2, 4] },
      ];
      mockFetch.mockResolvedValue(
        mockSuccessResponse(JSON.stringify(mockResponse))
      );

      await exploreSpace(mockPath, mockPattern, mockToken);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url.toString()).toBe(
        buildExpectedUrl("/spaces/explore/", mockPath) + "/"
      );
      expect(options?.method).toBe("POST");
      expect(options?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );

      const body = JSON.parse(options?.body as string);
      expect(body).toHaveProperty("pattern", mockPattern);
      expect(body).toHaveProperty("token");
      expect(body.token).toBe("%01%02%03%04"); // URL-encoded token
    });

    it("should return stringified JSON array on success", async () => {
      const mockResponse = [
        { expr: "(test 1)", token: [5, 6, 7] },
        { expr: "(test 2)", token: [8, 9, 10] },
      ];
      mockFetch.mockResolvedValue(
        mockSuccessResponse(JSON.stringify(mockResponse))
      );

      const result = await exploreSpace(mockPath, mockPattern, mockToken);

      expect(JSON.parse(result)).toEqual(mockResponse);
    });

    it("should handle empty token for initial exploration", async () => {
      const emptyToken = new Uint8Array([]);
      mockFetch.mockResolvedValue(mockSuccessResponse(JSON.stringify([])));

      await exploreSpace(mockPath, mockPattern, emptyToken);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options?.body as string);
      expect(body.token).toBe(""); // Empty token for root exploration
    });

    it("should handle token as array of numbers", async () => {
      const tokenArray = [1, 2, 3, 4];
      mockFetch.mockResolvedValue(mockSuccessResponse(JSON.stringify([])));

      await exploreSpace(mockPath, mockPattern, tokenArray);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options?.body as string);
      expect(body.token).toBe("%01%02%03%04");
    });

    it("should handle root path exploration", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse(JSON.stringify([])));

      await exploreSpace("/", mockPattern, mockToken);

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toBe("http://localhost:8000/spaces/explore/");
    });

    it("should handle nested namespace paths", async () => {
      const nestedPath = "/user/data/subfolder/";
      mockFetch.mockResolvedValue(mockSuccessResponse(JSON.stringify([])));

      await exploreSpace(nestedPath, mockPattern, mockToken);

      const [url] = mockFetch.mock.calls[0];
      expect(url.toString()).toBe(
        "http://localhost:8000/spaces/explore/user/data/subfolder/"
      );
    });

    it("should handle complex patterns", async () => {
      const complexPattern = "(parent $a $b)";
      mockFetch.mockResolvedValue(mockSuccessResponse(JSON.stringify([])));

      await exploreSpace(mockPath, complexPattern, mockToken);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options?.body as string);
      expect(body.pattern).toBe(complexPattern);
    });

    it("should return empty array when no children found", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse(JSON.stringify([])));

      const result = await exploreSpace(mockPath, mockPattern, mockToken);

      expect(JSON.parse(result)).toEqual([]);
    });

    it("should throw an error when unauthorized", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Unauthorized", 401));

      await expect(
        exploreSpace(mockPath, mockPattern, mockToken)
      ).rejects.toThrow("Unauthorized");
    });

    it("should throw an error when user lacks read permission", async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse("Forbidden - Read permission required", 403)
      );

      await expect(
        exploreSpace(mockPath, mockPattern, mockToken)
      ).rejects.toThrow("Forbidden - Read permission required");
    });

    it("should throw an error on network failure", async () => {
      const networkError = new TypeError("Failed to fetch");
      mockFetch.mockRejectedValue(networkError);

      await expect(
        exploreSpace(mockPath, mockPattern, mockToken)
      ).rejects.toThrow(networkError);
    });

    it("should handle server errors with proper error messages", async () => {
      mockFetch.mockResolvedValue(
        mockPlainTextResponse("Internal Server Error", 500)
      );

      await expect(
        exploreSpace(mockPath, mockPattern, mockToken)
      ).rejects.toThrow("Internal Server Error");
    });

    it("should handle MORK server communication errors", async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse("MORK server unreachable", 502)
      );

      await expect(
        exploreSpace(mockPath, mockPattern, mockToken)
      ).rejects.toThrow("MORK server unreachable");
    });

    it("should properly encode special characters in tokens", async () => {
      const specialToken = new Uint8Array([0xff, 0x00, 0x7f, 0x20]);
      mockFetch.mockResolvedValue(mockSuccessResponse(JSON.stringify([])));

      await exploreSpace(mockPath, mockPattern, specialToken);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options?.body as string);
      expect(body.token).toBe("%FF%00%7F%20");
    });

    it("should handle large token arrays", async () => {
      const largeToken = new Uint8Array(256).fill(1);
      mockFetch.mockResolvedValue(mockSuccessResponse(JSON.stringify([])));

      await exploreSpace(mockPath, mockPattern, largeToken);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options?.body as string);
      expect(body.token).toHaveLength(768); // 256 bytes * 3 chars per byte (%01)
    });

    it("should handle response with multiple exploration results", async () => {
      const mockResponse = Array.from({ length: 256 }, (_, i) => ({
        expr: `(test ${i})`,
        token: [i, i + 1],
      }));
      mockFetch.mockResolvedValue(
        mockSuccessResponse(JSON.stringify(mockResponse))
      );

      const result = await exploreSpace(mockPath, mockPattern, mockToken);

      expect(JSON.parse(result)).toHaveLength(256);
    });
  });
});

describe("API Tests: Tokens Page", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BACKEND_URL", "http://localhost:8000");
    const localStorageMock = {
      getItem: vi.fn((key: string) => {
        if (key === "rootToken") return "200003ee-c651-4069-8b7f-2ad9fb46c3ab";
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    vi.stubGlobal("localStorage", localStorageMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });
  const mockRootToken = "200003ee-c651-4069-8b7f-2ad9fb46c3ab";

  describe("fetchTokens", () => {
    it("should send a GET request to fetch all tokens", async () => {
      const mockTokens = [
        {
          id: 1,
          code: "token-code-1",
          description: "Test token 1",
          namespace: "/test/",
          creation_timestamp: "2025-01-01T00:00:00",
          permission_read: true,
          permission_write: false,
          permission_share_read: false,
          permission_share_write: false,
          permission_share_share: false,
          parent: 0,
        },
        {
          id: 2,
          code: "token-code-2",
          description: "Test token 2",
          namespace: "/test/data/",
          creation_timestamp: "2025-01-02T00:00:00",
          permission_read: true,
          permission_write: true,
          permission_share_read: true,
          permission_share_write: false,
          permission_share_share: false,
          parent: 1,
        },
      ];
      mockFetch.mockResolvedValue(mockSuccessResponse(mockTokens));

      await fetchTokens(mockRootToken);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url.toString()).toBe("http://localhost:8000/tokens");
      expect(options?.method).toBe("GET");
    });

    it("should return array of tokens on success", async () => {
      const mockTokens = [
        {
          id: 1,
          code: "abc-123",
          description: "Token 1",
          namespace: "/",
          creation_timestamp: "2025-01-01T00:00:00",
          permission_read: true,
          permission_write: true,
          permission_share_read: true,
          permission_share_write: true,
          permission_share_share: true,
          parent: 0,
        },
      ];
      mockFetch.mockResolvedValue(mockSuccessResponse(mockTokens));

      const result = await fetchTokens(mockRootToken);

      expect(result).toEqual(mockTokens);
    });

    it("should throw an error when unauthorized", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Unauthorized", 401));

      await expect(fetchTokens(mockRootToken)).rejects.toThrow("Unauthorized");
    });

    it("should throw an error on network failure", async () => {
      const networkError = new TypeError("Failed to fetch");
      mockFetch.mockRejectedValue(networkError);

      await expect(fetchTokens(mockRootToken)).rejects.toThrow(networkError);
    });

    it("should handle server errors", async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse("Internal Server Error", 500)
      );

      await expect(fetchTokens(mockRootToken)).rejects.toThrow(
        "Internal Server Error"
      );
    });
  });

  describe("createToken", () => {
    const mockRootToken = "root-token-code";
    const mockTokenData = {
      description: "New test token",
      namespace: "/test/new/",
      read: true,
      write: false,
      shareRead: false,
      shareWrite: false,
      shareShare: false,
    };

    it("should send a POST request with correct token data", async () => {
      const mockCreatedToken = {
        id: 3,
        code: "new-token-code",
        description: mockTokenData.description,
        namespace: mockTokenData.namespace,
        creation_timestamp: "2025-01-03T00:00:00",
        permission_read: mockTokenData.read,
        permission_write: mockTokenData.write,
        permission_share_read: mockTokenData.shareRead,
        permission_share_write: mockTokenData.shareWrite,
        permission_share_share: mockTokenData.shareShare,
        parent: 1,
      };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockCreatedToken));

      await createToken(
        mockRootToken,
        mockTokenData.description,
        mockTokenData.namespace,
        mockTokenData.read,
        mockTokenData.write,
        mockTokenData.shareRead,
        mockTokenData.shareWrite,
        mockTokenData.shareShare
      );

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url.toString()).toBe("http://localhost:8000/tokens");
      expect(options?.method).toBe("POST");
      expect(options?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );

      const body = JSON.parse(options?.body as string);
      expect(body).toHaveProperty("description", mockTokenData.description);
      expect(body).toHaveProperty("namespace", mockTokenData.namespace);
      expect(body).toHaveProperty("permission_read", mockTokenData.read);
      expect(body).toHaveProperty("permission_write", mockTokenData.write);
    });

    it("should return created token on success", async () => {
      const mockCreatedToken = {
        id: 4,
        code: "created-token",
        description: "Created",
        namespace: "/created/",
        creation_timestamp: "2025-01-04T00:00:00",
        permission_read: true,
        permission_write: false,
        permission_share_read: false,
        permission_share_write: false,
        permission_share_share: false,
        parent: 1,
      };
      mockFetch.mockResolvedValue(mockSuccessResponse(mockCreatedToken));

      const result = await createToken(
        mockRootToken,
        "Created",
        "/created/",
        true,
        false,
        false,
        false,
        false
      );

      expect(result).toEqual(mockCreatedToken);
    });

    it("should throw an error when namespace is invalid", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Invalid namespace", 400));

      await expect(
        createToken(
          mockRootToken,
          "Test",
          "invalid-namespace",
          true,
          false,
          false,
          false,
          false
        )
      ).rejects.toThrow("Invalid namespace");
    });

    it("should throw an error when unauthorized", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Unauthorized", 401));

      await expect(
        createToken(
          mockRootToken,
          "Test",
          "/test/",
          true,
          false,
          false,
          false,
          false
        )
      ).rejects.toThrow("Unauthorized");
    });

    it("should throw an error when missing share permissions", async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse("Insufficient permissions", 400)
      );

      await expect(
        createToken(
          mockRootToken,
          "Test",
          "/test/",
          true,
          true,
          false,
          false,
          false
        )
      ).rejects.toThrow("Insufficient permissions");
    });

    it("should handle network failures", async () => {
      const networkError = new TypeError("Failed to fetch");
      mockFetch.mockRejectedValue(networkError);

      await expect(
        createToken(
          mockRootToken,
          "Test",
          "/test/",
          true,
          false,
          false,
          false,
          false
        )
      ).rejects.toThrow(networkError);
    });
  });

  describe("refreshCodes", () => {
    it("should send POST requests for each token ID", async () => {
      const tokenIds = [1, 2, 3];
      const mockRefreshedTokens = tokenIds.map((id) => ({
        id,
        code: `refreshed-code-${id}`,
        description: `Token ${id}`,
        namespace: `/test${id}/`,
        creation_timestamp: "2025-01-05T00:00:00",
        permission_read: true,
        permission_write: false,
        permission_share_read: false,
        permission_share_write: false,
        permission_share_share: false,
        parent: 0,
      }));

      mockFetch
        .mockResolvedValueOnce(mockSuccessResponse(mockRefreshedTokens[0]))
        .mockResolvedValueOnce(mockSuccessResponse(mockRefreshedTokens[1]))
        .mockResolvedValueOnce(mockSuccessResponse(mockRefreshedTokens[2]));

      await refreshCodes(mockRootToken, tokenIds);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      tokenIds.forEach((id, index) => {
        const [url, options] = mockFetch.mock.calls[index];
        expect(url.toString()).toBe(`http://localhost:8000/tokens/${id}`);
        expect(options?.method).toBe("POST");
      });
    });

    it("should return array of refreshed tokens", async () => {
      const tokenIds = [1, 2];
      const mockRefreshedTokens = [
        {
          id: 1,
          code: "new-code-1",
          description: "Token 1",
          namespace: "/test1/",
          creation_timestamp: "2025-01-05T00:00:00",
          permission_read: true,
          permission_write: false,
          permission_share_read: false,
          permission_share_write: false,
          permission_share_share: false,
          parent: 0,
        },
        {
          id: 2,
          code: "new-code-2",
          description: "Token 2",
          namespace: "/test2/",
          creation_timestamp: "2025-01-05T00:00:00",
          permission_read: true,
          permission_write: true,
          permission_share_read: false,
          permission_share_write: false,
          permission_share_share: false,
          parent: 0,
        },
      ];

      mockFetch
        .mockResolvedValueOnce(mockSuccessResponse(mockRefreshedTokens[0]))
        .mockResolvedValueOnce(mockSuccessResponse(mockRefreshedTokens[1]));

      const result = await refreshCodes(mockRootToken, tokenIds);

      expect(result).toEqual(mockRefreshedTokens);
    });

    it("should handle empty token ID array", async () => {
      const result = await refreshCodes(mockRootToken, []);

      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should throw an error when token not found", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Token not found", 404));

      await expect(refreshCodes(mockRootToken, [999])).rejects.toThrow(
        "Token not found"
      );
    });

    it("should throw an error when unauthorized", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Unauthorized", 401));

      await expect(refreshCodes(mockRootToken, [1])).rejects.toThrow(
        "Unauthorized"
      );
    });

    it("should handle partial failures gracefully", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockSuccessResponse({ id: 1, code: "new-code-1" })
        )
        .mockRejectedValueOnce(new Error("Failed to refresh token 2"));

      await expect(refreshCodes(mockRootToken, [1, 2])).rejects.toThrow(
        "Failed to refresh token 2"
      );
    });
  });

  describe("deleteToken", () => {
    it("should send a DELETE request for the token ID", async () => {
      const tokenId = 5;
      mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

      await deleteToken(mockRootToken, tokenId);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url.toString()).toBe(`http://localhost:8000/tokens/${tokenId}`);
      expect(options?.method).toBe("DELETE");
    });

    it("should succeed when token is deleted", async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

      await expect(deleteToken(mockRootToken, 1)).resolves.not.toThrow();
    });

    it("should throw an error when token not found", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Token not found", 404));

      await expect(deleteToken(mockRootToken, 999)).rejects.toThrow(
        "Token not found"
      );
    });

    it("should throw an error when unauthorized", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse("Unauthorized", 401));

      await expect(deleteToken(mockRootToken, 1)).rejects.toThrow(
        "Unauthorized"
      );
    });

    it("should throw an error when trying to delete root token", async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse("Cannot delete root token", 400)
      );

      await expect(deleteToken(mockRootToken, 0)).rejects.toThrow(
        "Cannot delete root token"
      );
    });

    it("should handle network failures", async () => {
      const networkError = new TypeError("Failed to fetch");
      mockFetch.mockRejectedValue(networkError);

      await expect(deleteToken(mockRootToken, 1)).rejects.toThrow(networkError);
    });
  });

  describe("deleteTokens", () => {
    it("should send a DELETE request with token IDs in body", async () => {
      const tokenIds = [1, 2, 3];
      mockFetch.mockResolvedValue(mockSuccessResponse(3));

      await deleteTokens(mockRootToken, tokenIds);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url.toString()).toBe("http://localhost:8000/tokens");
      expect(options?.method).toBe("DELETE");
      expect(options?.headers).toHaveProperty(
        "Content-Type",
        "application/json"
      );
      expect(options?.body).toBe(JSON.stringify(tokenIds));
    });

    it("should return number of deleted tokens on success", async () => {
      const tokenIds = [1, 2, 3, 4];
      mockFetch.mockResolvedValue(mockSuccessResponse(4));

      const result = await deleteTokens(mockRootToken, tokenIds);

      expect(result).toBe(4);
    });

    it("should handle empty token ID array", async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse(0));

      const result = await deleteTokens(mockRootToken, []);

      expect(result).toBe(0);
    });

    it("should throw an error when some tokens not found", async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse("Some tokens not found", 404)
      );

      await expect(deleteTokens(mockRootToken, [1, 999])).rejects.toThrow(
        "Some tokens not found"
      );
    });
  });
});
