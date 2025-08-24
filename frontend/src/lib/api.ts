export const API_URL = import.meta.env.VITE_BACKEND_URL;

export interface Token {
	id: number;
	code: string;
	description: string;
	namespace: string;
	creation_timestamp: string;
	permission_read: boolean;
	permission_write: boolean;
	permission_share_share: boolean;
	permission_share_read: boolean;
	permission_share_write: boolean;
	parent: number | null;
}

export interface Transformation {
	space: string;
	patterns: string[];
	templates: string[];
}

export enum CSVParseDirection {
	Row = 1,
	Column = 2,
	CellUnlabeled = 3,
	CellLabeled = 4,
}

export interface CSVParserParameters {
	direction: CSVParseDirection;
	delimiter: string;
}

export interface ExploreDetail {
	expr: string;
	token: Uint8Array;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
	const headers = {
		...options.headers,
		//'Authorization': `${localStorage.getItem("token")}`,
		'Authorization': `200003ee-c651-4069-8b7f-2ad9fb46c3ab`,
	};

	const response = await fetch(`${API_URL}${url}`, { ...options, headers });
	if (!response.ok) {
		console.error(new Error(`HTTP error! status: ${response.status}`));
	}

	let res = await response.json();
	return res
}

export const transform = (transformation: Transformation) => {
	return request<boolean>('/spaces', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(transformation),
	});
};

export const importSpace = (path: string, uri: string) => {
	return request<boolean>(`/spaces/${path}?uri=${uri}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
	});
};

export const readSpace = (path: string) => {
	return request<string>(`/spaces${path}`);
};

function quoteFromBytes(data: Uint8Array): string {
	let result = '';
 
	for (let i = 0; i < data.length; i++) {
		const byte = data[i];
 
		// Safe characters: alphanumeric and -_.~
		if ((byte >= 0x30 && byte <= 0x39) ||    // 0-9
			(byte >= 0x41 && byte <= 0x5A) ||    // A-Z
			(byte >= 0x61 && byte <= 0x7A) ||    // a-z
			byte === 0x2D || byte === 0x5F ||    // - _
			byte === 0x2E || byte === 0x7E) {    // . ~
			result += String.fromCharCode(byte);
		} else {
			// Percent-encode everything else
			result += '%' + byte.toString(16).padStart(2, '0').toUpperCase();
		}
	}
 
	return result;
} 

export const exploreSpace = (path: string, pattern: string, token: Uint8Array | Array<number>) => {
	//let tokenStr = '';
	//
	//for (let i = 0; i < exploreDetails.token.length; i++) {
	//	tokenStr += String.fromCharCode(exploreDetails.token[i]);
	//}

	// if token is basic array change to Uint8Array
	if (token instanceof Array) {
		token = Uint8Array.from(token);
	}

	console.log("token before: ", token)
	console.log("token after: ", new TextDecoder().decode(token))
	return request<ExploreDetail[]>(`/explore/spaces${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			pattern,
			token: quoteFromBytes(token)
		}),
	})
}

window.exploreSpace = exploreSpace

export const getAllTokens = () => {
	return request<Token[]>('/tokens');
};

export const getToken = () => {
	return request<Token>('/token');
};

export const createToken = (new_token: Token) => {
	return request<Token>('/tokens', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(new_token),
	});
};

export const deleteTokens = (token_ids: number[]) => {
	return request<number>('/tokens', {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(token_ids),
	});
};

export const updateToken = (token_id: number) => {
	return request<Token>(`/tokens/${token_id}`, {
		method: 'POST',
	});
};

export const deleteToken = (token_id: number) => {
	return request(`/tokens/${token_id}`, {
		method: 'DELETE',
	});
};

export const createFromCSV = (file: File, params: CSVParserParameters) => {
	const formData = new FormData();
	formData.append('file', file);
	const url = new URL(`${API_URL}/translations/csv`);
	url.search = new URLSearchParams(params as any).toString();

	return fetch(url.toString(), {
		method: 'POST',
		body: formData,
		headers: {
			'Authorization': `${localStorage.getItem("token")}`,
		}
	}).then(response => response.json());
};

export const createFromNT = (file: File) => {
	const formData = new FormData();
	formData.append('file', file);

	return fetch(`${API_URL}/translations/nt`, {
		method: 'POST',
		body: formData,
		headers: {
			'Authorization': `${localStorage.getItem("token")}`,
		}
	}).then(response => response.json());
};

export const createFromJsonLd = (file: File) => {
	const formData = new FormData();
	formData.append('file', file);

	return fetch(`${API_URL}/translations/jsonld`, {
		method: 'POST',
		body: formData,
		headers: {
			'Authorization': `${localStorage.getItem("token")}`,
		}
	}).then(response => response.json());
};

export const createFromN3 = (file: File) => {
	const formData = new FormData();
	formData.append('file', file);

	return fetch(`${API_URL}/translations/n3`, {
		method: 'POST',
		body: formData,
		headers: {
			'Authorization': `${localStorage.getItem("token")}`,
		}
	}).then(response => response.json());
};
