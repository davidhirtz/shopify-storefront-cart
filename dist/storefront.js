var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { createStorefrontApiClient } from "@shopify/storefront-api-client";
export default class Shopify {
    constructor(domain, token, config = {}) {
        this.itemCount = 0;
        this.formatPrice = (money) => {
            const currency = money.currencyCode == 'EUR' ? '€' : money.currencyCode;
            return parseFloat(money.amount).toLocaleString(this.language || undefined, { minimumFractionDigits: 2 }) + ' ' + currency;
        };
        const shopify = this;
        const getById = (id) => document.getElementById(id);
        Object.assign(shopify, Object.assign({ $cartCount: getById('cart-count'), $cart: getById('cart'), $items: getById('items'), $subtotal: getById('subtotal'), errorClass: 'cart-error', isEmptyClass: 'is-empty', isLoadingClass: 'is-loading', language: document.documentElement.lang || null, thumbnailMaxWidth: 200, thumbnailMaxHeight: 200, storageKey: 'shopifyCartId' }, config));
        shopify.itemCount = 0;
        shopify.client = createStorefrontApiClient({
            apiVersion: '2025-01',
            storeDomain: domain,
            publicAccessToken: token,
        });
        shopify.cartId = localStorage.getItem(shopify.storageKey);
        shopify.cart = null;
        shopify.updateCart().then(() => {
            shopify.afterInit();
        });
    }
    afterInit() {
    }
    request(operation, params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.request(operation, params)
                .then(({ errors, data }) => {
                if (errors) {
                    console.error(errors.graphQLErrors);
                    this.renderError(errors.message);
                }
                return data || {};
            });
        });
    }
    updateCart() {
        return __awaiter(this, void 0, void 0, function* () {
            const shopify = this;
            if (shopify.cartId) {
                const operation = `fragment CartFragment on Cart { id createdAt updatedAt lines(first: 20) { nodes { ...CartLineFragment } pageInfo { hasNextPage hasPreviousPage } } attributes { key value } cost { totalAmount { amount currencyCode } subtotalAmount { amount currencyCode } totalTaxAmount { amount currencyCode } totalDutyAmount { amount currencyCode } } checkoutUrl discountCodes { applicable code } discountAllocations { discountedAmount { amount currencyCode } discountApplication { targetType allocationMethod targetSelection value { ... on PricingPercentageValue { percentage } ... on MoneyV2 { amount currencyCode } } } ... on CartCodeDiscountAllocation { code } ... on CartAutomaticDiscountAllocation { title } ... on CartCustomDiscountAllocation { title } } appliedGiftCards { ...AppliedGiftCardFragment } note } fragment CartLineFragment on CartLine { id merchandise { ... on ProductVariant { id title image { thumbnail: url(transform: { maxWidth: ${shopify.thumbnailMaxWidth}, maxHeight: ${shopify.thumbnailMaxHeight}, }) url altText width height } product { id handle title } weight availableForSale sku selectedOptions { name value } compareAtPrice { amount currencyCode } price { amount currencyCode } unitPrice { amount currencyCode } unitPriceMeasurement { measuredType quantityUnit quantityValue referenceUnit referenceValue } } } quantity attributes { key value } cost { totalAmount { amount currencyCode } subtotalAmount { amount currencyCode } amountPerQuantity { amount currencyCode } compareAtAmountPerQuantity { amount currencyCode } } discountAllocations { discountedAmount { amount currencyCode } discountApplication { targetType allocationMethod targetSelection value { ... on PricingPercentageValue { percentage } ... on MoneyV2 { amount currencyCode } } } ... on CartCodeDiscountAllocation { code } ... on CartAutomaticDiscountAllocation { title } ... on CartCustomDiscountAllocation { title } } } fragment AppliedGiftCardFragment on AppliedGiftCard { amountUsed { amount currencyCode } amountUsedV2: amountUsed { amount currencyCode } balance { amount currencyCode } balanceV2: balance { amount currencyCode } presentmentAmountUsed { amount currencyCode } id lastCharacters } query CartQuery($cartId: ID!) { cart(id: $cartId) { ...CartFragment } }`;
                return shopify.request(operation, {
                    variables: {
                        cartId: shopify.cartId,
                    }
                }).then(({ cart }) => {
                    if (cart) {
                        shopify.cart = cart;
                        shopify.updateItemCount();
                        shopify.afterCartUpdate();
                        return cart;
                    }
                    else {
                        return shopify.createCart();
                    }
                });
            }
            return shopify.createCart();
        });
    }
    createCart() {
        const shopify = this;
        const operation = `mutation createCart($i: CartInput) { cartCreate(input: $i) { cart { id checkoutUrl } } }`;
        shopify.request(operation).then((data) => {
            localStorage.setItem(shopify.storageKey, data.cartCreate.cart.id || null);
        });
    }
    updateItemCount() {
        const shopify = this;
        const itemCount = shopify.cart.lines.nodes.length || 0;
        if (shopify.itemCount !== itemCount) {
            shopify.itemCount = itemCount;
            shopify.onLineCountChange();
        }
    }
    afterCartUpdate() {
        const shopify = this;
        const total = shopify.cart.cost.totalAmount;
        shopify.$subtotal.innerHTML = total ? shopify.formatPrice(total) : '';
        shopify.$cart.classList.remove(shopify.isLoadingClass);
    }
    onLineCountChange() {
        const shopify = this;
        const count = shopify.itemCount;
        shopify.$cart.classList[count > 0 ? 'remove' : 'add'](shopify.isEmptyClass);
        shopify.updateCartCount(count);
        shopify.render();
    }
    updateCartCount(count) {
        this.$cartCount.innerHTML = count.toString();
    }
    addLine(variantId, quantity = 1) {
        const shopify = this;
        const operation = 'mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { id } } }';
        shopify.$cart.classList.add(shopify.isLoadingClass);
        shopify.request(operation, {
            variables: {
                cartId: shopify.cartId,
                lines: [
                    {
                        merchandiseId: `gid://shopify/ProductVariant/${variantId}`,
                        quantity: quantity
                    }
                ]
            }
        })
            .then(() => shopify.updateCart())
            .then(() => shopify.render());
    }
    updateLine(lineItemId, quantity) {
        return this.cartLinesUpdate(this.cart.lines.nodes.map((item) => ({
            id: item.id,
            quantity: item.id === lineItemId ? quantity : item.quantity
        })));
    }
    cartLinesUpdate(lines) {
        return __awaiter(this, void 0, void 0, function* () {
            const shopify = this;
            const operation = "mutation cartLinesUpdate( $cartId: ID! $lines: [CartLineUpdateInput!]! ) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { id } } }";
            yield shopify.request(operation, {
                variables: {
                    cartId: shopify.cartId,
                    lines: lines,
                }
            });
            return yield shopify.updateCart();
        });
    }
    // noinspection JSUnusedGlobalSymbols
    removeLine(lineItemId) {
        return this.updateLine(lineItemId, 0);
    }
    clearLines() {
        return this.cartLinesUpdate(this.cart.lines.nodes.map((item) => ({
            id: item.id,
            quantity: 0
        })));
    }
    render() {
        const shopify = this;
        shopify.$items.innerHTML = '';
        shopify.cart.lines.nodes.forEach((line) => shopify.$items.innerHTML += shopify.renderLine(line));
    }
    renderLine(item) {
        return this.renderLineTemplate({
            item: item,
        });
    }
    renderLineTemplate(params) {
        return new Function("return `" + this.itemTemplate + "`;").call(params);
    }
    renderError(error) {
        const shopify = this;
        const message = error || 'An unknown error occurred';
        shopify.$items.innerHTML = `<div class="${shopify.errorClass}">${message}</div>${shopify.$items.innerHTML}`;
    }
}
