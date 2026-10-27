import { describe, expect, it } from "vitest";
import { descriptionToHtml } from "@/lib/ebay/publish";

// The real case: a published listing showed "Brand: Richard Tyler
// Condition: Good pre-owned condition…" as one run-on block, because eBay
// renders the description as a web page and plain line breaks collapse.
const RED_HEELS = `Richard Tyler Red Satin Crystal Strappy Slingback Heels Sandals Evening Shoes

Brand: Richard Tyler

Condition: Good pre-owned condition. The red satin uppers show light wear.

Type: Strappy slingback dress sandals with a high heel.`;

describe("descriptionToHtml", () => {
  it("keeps every section as its own paragraph", () => {
    expect(descriptionToHtml(RED_HEELS)).toBe(
      [
        "<p>Richard Tyler Red Satin Crystal Strappy Slingback Heels Sandals Evening Shoes</p>",
        "<p>Brand: Richard Tyler</p>",
        "<p>Condition: Good pre-owned condition. The red satin uppers show light wear.</p>",
        "<p>Type: Strappy slingback dress sandals with a high heel.</p>",
      ].join("\n"),
    );
  });

  it("keeps a single line break inside a section", () => {
    expect(descriptionToHtml("Measurements:\nLength 10in\nWidth 7in")).toBe(
      "<p>Measurements:<br>Length 10in<br>Width 7in</p>",
    );
  });

  it("sends measurements marked with • as a list", () => {
    // eBay's phone limit counts a list item as 3 characters, a <br> as 50.
    expect(
      descriptionToHtml(
        "Actual Measurements:\n• Length: 18 in\n• Weight: 12 g\n\nColor: Gold & brown",
      ),
    ).toBe(
      "<p>Actual Measurements:</p><ul><li>Length: 18 in</li><li>Weight: 12 g</li></ul>\n<p>Color: Gold &amp; brown</p>",
    );
  });

  it("escapes text so a brand with & or < survives", () => {
    expect(descriptionToHtml("Brand: Charles & Keith\n\nSize <M>")).toBe(
      "<p>Brand: Charles &amp; Keith</p>\n<p>Size &lt;M&gt;</p>",
    );
  });

  it("copes with Windows line endings and stray blank lines", () => {
    expect(descriptionToHtml("A\r\n\r\n\r\nB\r\n")).toBe("<p>A</p>\n<p>B</p>");
  });

  it("returns nothing for nothing", () => {
    expect(descriptionToHtml("   ")).toBe("");
  });
});
