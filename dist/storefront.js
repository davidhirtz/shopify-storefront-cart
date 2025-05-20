import { createStorefrontApiClient } from "@shopify/storefront-api-client";
// noinspection JSUnusedGlobalSymbols
export default class Shopify {
    $cart = 'shopify-cart';
    $count = 'shopify-count';
    $checkout = 'shopify-checkout';
    $lines = 'shopify-lines';
    $link = 'shopify-link';
    $quantity = '[data-shopify-quantity]';
    $subtotal = 'shopify-subtotal';
    $total = 'shopify-total';
    apiVersion = '2025-01';
    cartId;
    cart;
    client;
    errorClass = 'error';
    isEmptyClass = 'is-empty';
    isLoadingClass = 'is-loading';
    lineCount = 0;
    totalQuantity = 0;
    itemTemplate;
    parent = document;
    storageKey = 'shopifyCartId';
    language;
    thumbnailMaxWidth = 200;
    thumbnailMaxHeight = 200;
    timeout;
    timeoutDuration = 500;
    useQuantity = false;
    constructor(domain, token, config = {}) {
        const shopify = this;
        Object.assign(shopify, {
            language: document.documentElement.lang || null,
            ...config
        });
        shopify.client = createStorefrontApiClient({
            apiVersion: shopify.apiVersion,
            storeDomain: domain,
            publicAccessToken: token,
        });
        shopify.cartId = localStorage.getItem(shopify.storageKey);
        shopify.loadCart().then(() => shopify.afterInit());
    }
    async loadCart() {
        const shopify = this;
        const operation = `fragment CartFragment on Cart { id createdAt updatedAt lines(first: 20) { nodes { ...CartLineFragment } pageInfo { hasNextPage hasPreviousPage } } attributes { key value } cost { totalAmount { amount currencyCode } subtotalAmount { amount currencyCode } totalTaxAmount { amount currencyCode } totalDutyAmount { amount currencyCode } } checkoutUrl discountCodes { applicable code } discountAllocations { discountedAmount { amount currencyCode } discountApplication { targetType allocationMethod targetSelection value { ... on PricingPercentageValue { percentage } ... on MoneyV2 { amount currencyCode } } } ... on CartCodeDiscountAllocation { code } ... on CartAutomaticDiscountAllocation { title } ... on CartCustomDiscountAllocation { title } } appliedGiftCards { ...AppliedGiftCardFragment } note } fragment CartLineFragment on CartLine { id merchandise { ... on ProductVariant { id title image { thumbnail: url(transform: { maxWidth: ${shopify.thumbnailMaxWidth}, maxHeight: ${shopify.thumbnailMaxHeight}, }) url altText width height } product { id handle title } weight availableForSale sku selectedOptions { name value } compareAtPrice { amount currencyCode } price { amount currencyCode } unitPrice { amount currencyCode } unitPriceMeasurement { measuredType quantityUnit quantityValue referenceUnit referenceValue } } } quantity attributes { key value } cost { totalAmount { amount currencyCode } subtotalAmount { amount currencyCode } amountPerQuantity { amount currencyCode } compareAtAmountPerQuantity { amount currencyCode } } discountAllocations { discountedAmount { amount currencyCode } discountApplication { targetType allocationMethod targetSelection value { ... on PricingPercentageValue { percentage } ... on MoneyV2 { amount currencyCode } } } ... on CartCodeDiscountAllocation { code } ... on CartAutomaticDiscountAllocation { title } ... on CartCustomDiscountAllocation { title } } } fragment AppliedGiftCardFragment on AppliedGiftCard { amountUsed { amount currencyCode } amountUsedV2: amountUsed { amount currencyCode } balance { amount currencyCode } balanceV2: balance { amount currencyCode } presentmentAmountUsed { amount currencyCode } id lastCharacters } query CartQuery($cartId: ID!) { cart(id: $cartId) { ...CartFragment } }`;
        if (!shopify.cartId) {
            return shopify.createCart();
        }
        return shopify.request(operation, {
            variables: {
                cartId: shopify.cartId,
            }
        }).then(({ cart }) => {
            if (!cart) {
                return shopify.createCart();
            }
            shopify.cart = cart;
            shopify.lineCount = cart.lines.nodes.length || 0;
            shopify.totalQuantity = shopify.lineCount
                ? cart.lines.nodes.reduce((total, line) => total + line.quantity, 0)
                : 0;
            shopify.updateCart();
        });
    }
    async createCart() {
        const shopify = this;
        const operation = `mutation createCart($i: CartInput) { cartCreate(input: $i) { cart { id checkoutUrl } } }`;
        return shopify.request(operation).then((data) => {
            const cart = data.cartCreate.cart || null;
            if (cart) {
                shopify.cartId = cart.id;
                localStorage.setItem(shopify.storageKey, cart.id);
                return shopify.loadCart();
            }
        });
    }
    async addLine(variantId, quantity = 1) {
        const shopify = this;
        const operation = 'mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { id } } }';
        shopify.setLoading(true);
        return shopify.request(operation, {
            variables: {
                cartId: shopify.cartId,
                lines: [
                    {
                        merchandiseId: `gid://shopify/ProductVariant/${variantId}`,
                        quantity: quantity
                    }
                ]
            }
        }).then(() => shopify.loadCart());
    }
    updateLine(lineItemId, quantity) {
        return this.cartLinesUpdate(this.cart.lines.nodes.map((item) => ({
            id: item.id,
            quantity: item.id === lineItemId ? quantity : item.quantity
        })));
    }
    async cartLinesUpdate(lines) {
        const shopify = this;
        const operation = "mutation cartLinesUpdate( $cartId: ID! $lines: [CartLineUpdateInput!]! ) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { id } } }";
        return shopify.request(operation, {
            variables: {
                cartId: shopify.cartId,
                lines: lines,
            }
        }).then(() => shopify.loadCart());
    }
    removeLine(lineItemId) {
        return this.updateLine(lineItemId, 0);
    }
    clearLines() {
        return this.cartLinesUpdate(this.cart.lines.nodes.map((item) => ({
            id: item.id,
            quantity: 0
        })));
    }
    afterInit() {
        this.renderCart();
    }
    onQuantityChange = ($input) => {
        const shopify = this;
        const callback = () => {
            shopify.setLoading(true);
            void shopify.updateLine($input.dataset.id, Math.max(parseInt($input.value), 0));
        };
        clearTimeout(shopify.timeout);
        shopify.timeout = window.setTimeout(callback, shopify.timeoutDuration);
    };
    renderCart() {
        const shopify = this;
        shopify.updateCart();
        shopify.renderCheckout();
    }
    updateCart() {
        const shopify = this;
        shopify.toggleEmpty();
        shopify.renderCartCount();
        shopify.renderLines();
        shopify.renderTotals();
        shopify.setLoading();
    }
    renderCartCount() {
        const shopify = this;
        const count = shopify.useQuantity ? shopify.totalQuantity : shopify.lineCount;
        shopify.queryAll(shopify.$count, ($el) => $el.innerHTML = count.toString());
        shopify.queryAll(shopify.$link, ($el) => $el.style.display = count > 0 ? 'block' : 'none');
    }
    renderCheckout() {
        const shopify = this;
        shopify.queryAll(shopify.$checkout, ($el) => $el.onclick = () => {
            if (shopify.lineCount) {
                location.href = shopify.cart.checkoutUrl;
            }
        });
    }
    renderLines() {
        const shopify = this;
        shopify.queryAll(shopify.$lines, ($items) => {
            let html = '';
            shopify.cart.lines.nodes.forEach((line) => html += shopify.renderLine(line));
            $items.innerHTML = html;
        });
        shopify.queryAll(shopify.$quantity, ($input) => {
            $input.onchange = () => shopify.onQuantityChange($input);
        });
    }
    renderLine(line) {
        return this.renderLineTemplate({
            line: line,
        });
    }
    renderTotals() {
        const shopify = this;
        const cart = shopify.cart;
        shopify.queryAll(shopify.$subtotal, ($el) => {
            return $el.innerHTML = cart ? shopify.formatPrice(cart.cost.subtotalAmount) : '';
        });
        shopify.queryAll(shopify.$total, ($el) => {
            return $el.innerHTML = cart ? shopify.formatPrice(cart.cost.totalAmount) : '';
        });
    }
    renderLineTemplate(params) {
        return new Function("return `" + this.itemTemplate + "`;").call(params);
    }
    renderError(error) {
        const shopify = this;
        const message = error || 'An unknown error occurred';
        shopify.queryAll(shopify.$lines, ($lines) => {
            $lines.innerHTML = `<div class="${shopify.errorClass}">${message}</div>${$lines.innerHTML}`;
        });
    }
    toggleEmpty() {
        const shopify = this;
        shopify.queryAll(shopify.$cart, ($el) => $el.classList.toggle(shopify.isEmptyClass, !shopify.lineCount));
    }
    setLoading(value = false) {
        const shopify = this;
        shopify.queryAll(shopify.$cart, ($cart) => {
            $cart.classList[value ? 'add' : 'remove'](shopify.isLoadingClass);
        });
    }
    formatPrice = (money) => {
        const currency = money.currencyCode == 'EUR' ? '€' : money.currencyCode;
        return parseFloat(money.amount).toLocaleString(this.language || undefined, { minimumFractionDigits: 2 }) + ' ' + currency;
    };
    async request(operation, params) {
        return this.client.request(operation, params)
            .then(({ errors, data }) => {
            if (errors) {
                console.error(errors.graphQLErrors);
                this.renderError(errors.message);
            }
            return data || {};
        });
    }
    queryAll = (selector, callback) => {
        if (selector) {
            const $list = this.parent.querySelectorAll(selector);
            if (callback) {
                $list.forEach(callback);
            }
            return $list;
        }
    };
}
