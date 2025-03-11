const COUPONS_RESPONSE = {
    GET_COUPONS: {
      version: "replace_version",
      sub_action: "replace_sub_action",
      data: {
        coupons: [
          {
            description: "Get 10% off on your 1st order above ₹100.",
            code: "TRYNEW10",
            id: "trynew10_ref_id",
          },
          {
            description: "15% off up to ₹75",
            code: "NEWEYE15",
            id: "neweye15_ref_id",
          },
          {
            description:
              "Get 50% off on your 1st order above ₹80. Maximum Discount: ₹50",
            code: "WELCOME50",
            id: "welcome50_ref_id",
          },
        ],
      },
    },
  };

  const EMPTY_COUPONS_RESPONSE = {
    GET_COUPONS: {
      version: "replace_version",
      sub_action: "replace_sub_action",
      data: {
        coupons: [],
      },
    },
  };

  const NO_COUPONS_RESPONSE = {
    GET_COUPONS: {
      version: "replace_version",
      sub_action: "replace_sub_action",
      data: {},
    },
  };

  const COUPON_DISCOUNT = {
    TRYNEW10: 10,
    NEWEYE15: 15,
    WELCOME50: 50,
  };

  const DEFAULT_SHIPPING_COST = 100;

  export const getResponse = async (decryptedBody) => {
    const { screen, data, version, action, sub_action, flow_token } =
      decryptedBody || {};

    // handle health check request
    if (action === "ping") {
      return {
        version,
        data: {
          status: "active",
        },
      };
    }

    // handle error notification
    if (data?.error) {
      console.warn("Received client error:", data);
      return {
        version,
        data: {
          acknowledged: true,
        },
      };
    }

    if (action === "data_exchange") {
      switch (sub_action) {
        case "get_coupons":
          return {
            ...COUPONS_RESPONSE.GET_COUPONS,
            version: version,
            sub_action: sub_action,
          };

        case "apply_coupon": {
          const order_details = data?.order_details;
          const couponCode = data?.input?.coupon?.code;
          const couponId = data?.input?.coupon?.id;

          if (!order_details || !couponCode || !couponId) {
            console.error("Order details, coupon code or id is missing.");
            return {
              version: version,
              sub_action: sub_action,
              data: { error: "Invalid order details, coupon code or id." },
            };
          }

          const order = order_details?.order;
          const items = order?.items;
          if (couponCode === "TRYNEW10" && items?.[0]?.sale_amount?.value) {
            const itemDiscount =
              (items[0].sale_amount.value * COUPON_DISCOUNT[couponCode]) / 100;
            items[0].sale_amount.value -= itemDiscount;
            order.subtotal.value -= itemDiscount;
            order_details.total_amount.value -= itemDiscount;

            order_details.coupon = {
              code: couponCode,
              id: couponId,
              discount: {
                value: itemDiscount,
                offset: 100,
              },
            };
          } else if (couponCode.toUpperCase() === "code5".toUpperCase()) {
            // 5% discount on the manually enter discount code "CODE"
            const discount = (order_details.total_amount?.value * 5) / 100;
            if (discount) {
              order_details.total_amount.value -= discount;
              order_details.coupon = {
                code: couponCode,
                id: couponId,
                discount: {
                  value: discount,
                  offset: 100,
                },
              };
            }
          } else if (couponCode === "NEWEYE15" || couponCode === "WELCOME50") {
            const discount =
              (order_details.total_amount?.value * COUPON_DISCOUNT[couponCode]) /
              100;
            if (discount) {
              order_details.total_amount.value -= discount;
              order_details.coupon = {
                code: couponCode,
                id: couponId,
                discount: {
                  value: discount,
                  offset: 100,
                },
              };
            }
          } else {
            throw new CheckoutButtonTemplateEndpointException(427, {
              error_msg: `The offer code you have entered is not valid.`,
            });
          }

          return {
            version: version,
            sub_action: sub_action,
            data: {
              order_details: order_details,
            },
          };
        }

        case "remove_coupon": {
          const order_details = data?.order_details;
          const coupon = order_details?.coupon;
          const couponCode = coupon?.code;
          const couponId = coupon?.id;
          const discount = coupon?.discount?.value;

          if (!order_details || !couponCode || !couponId || !discount) {
            throw new CheckoutButtonTemplateEndpointException(421, {
              error_msg: `Invalid Request - Order details, coupon id, coupon code, or discount missing.`,
            });
          }

          if (couponCode === "TRYNEW10") {
            const order = order_details?.order;
            const items = order?.items;

            if (items?.[0]?.sale_amount?.value) {
              items[0].sale_amount.value += discount;
              order.subtotal.value += discount;
              order_details.total_amount.value += discount;
            }
            order_details.coupon = {};
          } else {
            order_details.total_amount.value += discount;
            delete order_details.coupon;
          }

          return {
            version: version,
            sub_action: sub_action,
            data: {
              order_details: order_details,
            },
          };
        }

        case "apply_shipping": {
          const order_details = data?.order_details;
          const selectedAddress = data?.input?.selected_address;

          if (!order_details || !selectedAddress) {
            throw new CheckoutButtonTemplateEndpointException(421, {
              error_msg: `Invalid Request - Order details or selected address missing.`,
            });
          }

          if (selectedAddress.in_pin_code !== "400051") {
            throw new CheckoutButtonTemplateEndpointException(427, {
              error_msg: `Currently we operate only in Mumbai area (400051)`,
            });
          }

          const shipping_info = order_details?.shipping_info;
          if (shipping_info) {
            if (shipping_info.selected_address) {
              shipping_info.selected_address = selectedAddress;
            } else {
              order_details.shipping_info.selected_address = selectedAddress;
              const order = order_details?.order;

              if (order?.shipping?.value != null) {
                order.shipping.value += DEFAULT_SHIPPING_COST;
                order_details.total_amount.value += DEFAULT_SHIPPING_COST;
              }
            }
          }

          return {
            version: version,
            sub_action: sub_action,
            data: {
              order_details: order_details,
            },
          };
        }

        default:
          throw new CheckoutButtonTemplateEndpointException(421, {
            error_msg: `Invalid Request - Unsupported sub action`,
          });
      }
    }

    throw new CheckoutButtonTemplateEndpointException(421, {
      error_msg: `Invalid Request - Unsupported action`,
    });
  };

  export const CheckoutButtonTemplateEndpointException = class CheckoutButtonTemplateEndpointException extends Error {
    constructor(statusCode, response) {
      super(response.error_msg);

      this.name = this.constructor.name;
      this.statusCode = statusCode;
      this.response = response;
    }
  };
