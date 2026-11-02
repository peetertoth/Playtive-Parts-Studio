# Model references and uncertainties

The catalog's target product is **Playtive 383000**. However, the illustrative geometries for its ten part types are based on the manual for the related **IAN 369527_2010** kit. The parts in the two kits have not been confirmed to be identical. The exact verified 383000 manual and physical measurements were unavailable.

## Evidence used

- [IAN 369527 manual, Manuals.co.uk](https://www.manuals.co.uk/playtive/ian-369527/manual): the parts drawing on page 2 of the 44-page document was visually checked.
- [Image of the inspected page 2](https://www.manuals.co.uk/viewer/40/2834640/2/bg2.webp): six connector shapes, a straight tube, fastening screw, wrench, and bent ground anchor. The connector drawing shows open cylindrical sockets and side fastening holes.

Labels and quantities in the manual may be on a separate text layer; the image provides shape references. The catalog does not specify inventory quantities. The `CS-*` and `KI-*` codes are local catalog identifiers, not manufacturer part numbers.

## Colors observed in 383000 product photos

When checked on November 2, 2026, [idealo's product page explicitly labeled 383000](https://www.idealo.de/preisvergleich/OffersOfProduct/204346808_-kinderklettergeruest-383000-playtive.html) displayed a [product photo with blue tubes and colored connectors](https://cdn.idealo.com/folder/Product/204346/8/204346808/s1_produktbild_max/playtive-kinderklettergeruest-383000.jpg) and linked to maxxi-shop's [eBay product page](https://www.ebay.de/itm/256545634682). The eBay page lists manufacturer number 100350031 and EAN 4055329045221. Colors were visually checked in its photos, including photos showing the individual parts; the product identification is retailer data, not a manufacturer parts list.

| Catalog type | Observed color | Direct image evidence |
| --- | --- | --- |
| `tube` | blue | [Tube and assembly steps](https://i.ebayimg.com/images/g/vI0AAOSwql9mbsRI/s-l1600.webp) |
| `elbow`, `tee` | red | [Individual connector panel](https://i.ebayimg.com/images/g/cS0AAOSwrJhmbsRF/s-l1600.webp) |
| `corner3` | yellow | [Connector panel, lower middle part](https://i.ebayimg.com/images/g/cS0AAOSwrJhmbsRF/s-l1600.webp) |
| `corner4`, `cross`, `connector5` | green | [Individual connector panel](https://i.ebayimg.com/images/g/cS0AAOSwrJhmbsRF/s-l1600.webp) |
| `screw`, `wrench` | black / dark gray | [Screw and tool in the assembly image](https://i.ebayimg.com/images/g/vI0AAOSwql9mbsRI/s-l1600.webp) |
| `anchor` | unidentified | Not clearly visible in the inspected photos; modeled in gray with an explicit unverified label. |

The [first](https://img.kleinanzeigen.de/api/v1/prod-ads/images/9f/9f78092c-bbdf-464b-898a-1c72c51251cd?rule=$_59.JPG) and [second photos](https://img.kleinanzeigen.de/api/v1/prod-ads/images/1a/1a150525-d193-4ff0-940c-18a4d9380c56?rule=$_59.JPG) of a [used kit advertised as 383000](https://www.kleinanzeigen.de/s-anzeige/playtive-kinderklettergeruest-383000-237-teiliges-klettersystem/3437544851-23-4393) show the same color distribution in a heavily faded condition; the seller reports fading caused by sunlight. This is not a separately verified retail color variant. The presumed Lidl [100350031 product page](https://www.lidl.de/p/playtive-kinderklettergeruest/p100350031) returned 404 when checked, so the mapping could not be confirmed with a direct Lidl photo.

The `colorName` field names a color family; `color` hex values are illustrative approximations, not measured shades, RAL/Pantone codes, or manufacturer specifications. Lighting in the photos and the display affect appearance. The related IAN 369527 manual is used only as a shape reference: its colors or possible variants are not identified with the 383000 kit.

## Geometry contract

- Each part is a separate reusable R3F group, without its own Canvas or camera.
- Models use Y-up coordinates, with the center of their bounding dimensions near the origin. The support tube's longitudinal axis is Y.
- `dimensionsMm` specifies the bounding size by axis: `length` = X, `width` = Z, `height` = Y. A textual size label may use the conventional human-readable order, such as tube length and diameter.
- Base geometry is built in millimeters. The `PartModel` root group converts to scene units once: **100 mm = 1 unit**.
- Estimated tube length is 350 mm, outside diameter 50 mm, and wall thickness 3.2 mm. Estimated connector socket outside diameter is 60 mm and inside diameter 51.2 mm; port centers lie 75 mm from the hub.
- Connector topologies are, respectively: two perpendicular branches; planar T; three mutually perpendicular spatial branches; one through branch and two spatial branches; planar cross; and planar cross with a fifth perpendicular branch.
- `ports` positions are the centers of visible openings in millimeters; directions are unit vectors pointing outward from the part. Port data alone does not define insertion depth. The planner uses an estimated 50 mm insertion and separate collision rules, detailed in `planner-design.md`. Accessories have no structural ports.
- The port view marks these locations with turquoise rings, dots, and outward arrows. The markers are illustrative only.

## What is estimated?

**Every dimension is estimated; every entry has `accuracy: "estimated"`.** Proportions, wall thicknesses, exact color shades, surface gloss, hole positions and shapes, and screw threads are not manufacturing data. The color families above were observed in product photos; the anchor's color is still unknown. Screw and tool details approximate the drawing, and the ground anchor's metallic appearance is also an assumption.

The tube has an open through bore and illustrative side holes. Connector sockets are open, with inner walls, rims, and a shaped central shell; internal intersections between multiple branches are approximated by overlapping surfaces rather than manufacturing-ready solids. The models support visual exploration of the parts; they are not dimensioned CAD models, assembly instructions, or load-capacity guidance.
