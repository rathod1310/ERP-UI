// White-label branding: "ERPNext" in translated strings becomes the brand.

import { test } from "node:test";
import assert from "node:assert/strict";

import { brandText, makeBrand, versionLine } from "../../public/js/core/branding.js";

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

test("About version lines lose the internal app name", () => {
	assert.equal(versionLine("erpnext: 16.53.0 (version-16)"), "16.53.0 (version-16)");
	assert.equal(versionLine("frappe: 16.55.1"), "16.55.1");
	assert.equal(versionLine("16.0.0"), "16.0.0");
});
