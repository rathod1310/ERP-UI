// White-label branding: "ERPNext" in translated strings becomes the brand.

import { test } from "node:test";
import assert from "node:assert/strict";

import { brandText, makeBrand } from "../../public/js/core/branding.js";

test("brand replaces whole words only", () => {
	const brand = makeBrand({ name: "SKYDOTERP", replace: ["ERPNext"] });
	assert.equal(brandText("ERPNext Settings", brand), "SKYDOTERP Settings");
	assert.equal(brandText("Welcome to ERPNext. ERPNext!", brand), "Welcome to SKYDOTERP. SKYDOTERP!");
	assert.equal(brandText("MyERPNextApp", brand), "MyERPNextApp");
	assert.equal(brandText(42, brand), 42);
});

test("missing or unsafe brand configuration changes nothing", () => {
	assert.equal(makeBrand(null), null);
	assert.equal(makeBrand({ name: "" }), null);
	assert.equal(makeBrand({ name: "X", replace: ["(.*)"] }), null);
	assert.equal(brandText("ERPNext", null), "ERPNext");
});
