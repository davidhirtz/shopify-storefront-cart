import {createStorefrontApiClient, StorefrontApiClient} from "@shopify/storefront-api-client";
import {Cart, CartLine, MoneyV2, Mutation} from "../types/storefront-api-types";

interface ShopifyConfig {
    $cartCount?: HTMLElement | null
    $cart?: HTMLElement | null
    $items?: HTMLElement | null
    $subtotal?: HTMLElement | null
    errorClass?: string
    isEmptyClass?: string
    isLoadingClass?: string
    language?: string
    thumbnailMaxWidth?: number
    thumbnailMaxHeight?: number
    storageKey?: string
}

export default class Shopify {
    $cart: HTMLElement | null;
    $cartCount: HTMLElement | null;
    $items: HTMLElement | null;
    $subtotal: HTMLElement | null;
    cartId: string | null;
    cart: Cart | null;
    client: StorefrontApiClient;
    errorClass: string = 'cart-error';
    isEmptyClass: string = 'is-empty';
    isLoadingClass: string = 'is-loading';
    itemCount: number = 0;
    itemTemplate: string;
    storageKey: string = 'shopifyCartId';
    language: string;
    thumbnailMaxWidth: number = 200;
    thumbnailMaxHeight: number = 200;

    constructor(domain: string, token: string, config: ShopifyConfig = {}) {
        const shopify = this;
        const getById = (id: string): HTMLElement => document.getElementById(id);

        Object.assign(shopify, {
            $cartCount: getById('cart-count'),
            $cart: getById('cart'),
            $items: getById('items'),
            $subtotal: getById('subtotal'),
            language: document.documentElement.lang || null,
            ...config
        });

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
        this.toggleLoading();
    }

    async request(operation: string, params?: object) {
        return this.client.request(operation, params)
            .then(({errors, data}: any) => {
                if (errors) {
                    console.error(errors.graphQLErrors);
                    this.renderError(errors.message);
                }

                return data || {};
            });
    }

    async updateCart() {
        const shopify = this;

        if (shopify.cartId) {
            const operation = `fragment CartFragment on Cart { id createdAt updatedAt lines(first: 20) { nodes { ...CartLineFragment } pageInfo { hasNextPage hasPreviousPage } } attributes { key value } cost { totalAmount { amount currencyCode } subtotalAmount { amount currencyCode } totalTaxAmount { amount currencyCode } totalDutyAmount { amount currencyCode } } checkoutUrl discountCodes { applicable code } discountAllocations { discountedAmount { amount currencyCode } discountApplication { targetType allocationMethod targetSelection value { ... on PricingPercentageValue { percentage } ... on MoneyV2 { amount currencyCode } } } ... on CartCodeDiscountAllocation { code } ... on CartAutomaticDiscountAllocation { title } ... on CartCustomDiscountAllocation { title } } appliedGiftCards { ...AppliedGiftCardFragment } note } fragment CartLineFragment on CartLine { id merchandise { ... on ProductVariant { id title image { thumbnail: url(transform: { maxWidth: ${shopify.thumbnailMaxWidth}, maxHeight: ${shopify.thumbnailMaxHeight}, }) url altText width height } product { id handle title } weight availableForSale sku selectedOptions { name value } compareAtPrice { amount currencyCode } price { amount currencyCode } unitPrice { amount currencyCode } unitPriceMeasurement { measuredType quantityUnit quantityValue referenceUnit referenceValue } } } quantity attributes { key value } cost { totalAmount { amount currencyCode } subtotalAmount { amount currencyCode } amountPerQuantity { amount currencyCode } compareAtAmountPerQuantity { amount currencyCode } } discountAllocations { discountedAmount { amount currencyCode } discountApplication { targetType allocationMethod targetSelection value { ... on PricingPercentageValue { percentage } ... on MoneyV2 { amount currencyCode } } } ... on CartCodeDiscountAllocation { code } ... on CartAutomaticDiscountAllocation { title } ... on CartCustomDiscountAllocation { title } } } fragment AppliedGiftCardFragment on AppliedGiftCard { amountUsed { amount currencyCode } amountUsedV2: amountUsed { amount currencyCode } balance { amount currencyCode } balanceV2: balance { amount currencyCode } presentmentAmountUsed { amount currencyCode } id lastCharacters } query CartQuery($cartId: ID!) { cart(id: $cartId) { ...CartFragment } }`;

            return shopify.request(operation, {
                variables: {
                    cartId: shopify.cartId,
                }
            }).then(({cart}: { cart: Cart | null }) => {
                if (cart) {
                    shopify.cart = cart;

                    shopify.updateItemCount();
                    shopify.afterCartUpdate();
                } else {
                    return shopify.createCart();
                }
            });
        }

        return shopify.createCart();
    }

    async createCart() {
        const shopify = this;
        const operation = `mutation createCart($i: CartInput) { cartCreate(input: $i) { cart { id checkoutUrl } } }`;

        return shopify.request(operation).then((data: Mutation) => {
            const cart = data.cartCreate.cart || null;

            if (cart) {
                shopify.cartId = cart.id;
                localStorage.setItem(shopify.storageKey, cart.id);
            }
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

        if (shopify.$subtotal) {
            shopify.$subtotal.innerHTML = total ? shopify.formatPrice(total) : '';
        }

        shopify.toggleLoading();
    }

    onLineCountChange() {
        const shopify = this;
        const count = shopify.itemCount;

        if (shopify.$cart) {
            shopify.$cart.classList[count > 0 ? 'remove' : 'add'](shopify.isEmptyClass);
        }

        shopify.updateCartCount(count);
        shopify.render();
    }

    updateCartCount(count: number) {
        if (this.$cartCount) {
            this.$cartCount.innerHTML = count.toString();
        }
    }

    addLine(variantId: string, quantity: number = 1) {
        const shopify = this;
        const operation = 'mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { id } } }';

        shopify.toggleLoading(true);

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

    updateLine(lineItemId: string, quantity: number) {
        return this.cartLinesUpdate(this.cart.lines.nodes.map((item: any) => ({
            id: item.id,
            quantity: item.id === lineItemId ? quantity : item.quantity
        })));
    }

    private async cartLinesUpdate(lines: any) {
        const shopify = this;
        const operation = "mutation cartLinesUpdate( $cartId: ID! $lines: [CartLineUpdateInput!]! ) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { id } } }";
        await shopify.request(operation, {
            variables: {
                cartId: shopify.cartId,
                lines: lines,
            }
        });

        return await shopify.updateCart();
    }

    removeLine(lineItemId: string) {
        return this.updateLine(lineItemId, 0);
    }

    clearLines() {
        return this.cartLinesUpdate(this.cart.lines.nodes.map((item: any) => ({
            id: item.id,
            quantity: 0
        })));
    }

    toggleLoading(force: boolean = false): void {
        const shopify = this;

        if (shopify.$cart) {
            shopify.$cart.classList.toggle(shopify.isLoadingClass, force);
        }
    }

    render(): void {
        const shopify = this;

        if (shopify.$items) {
            shopify.$items.innerHTML = '';
            shopify.cart.lines.nodes.forEach((line: CartLine) => shopify.$items.innerHTML += shopify.renderLine(line));
        }
    }

    renderLine(item: CartLine): string {
        return this.renderLineTemplate({
            item: item,
        })
    }

    renderLineTemplate(params: object): string {
        return new Function("return `" + this.itemTemplate + "`;").call(params);
    }

    renderError(error ?: string): void {
        const shopify = this;
        const message = error || 'An unknown error occurred';

        if (shopify.$items) {
            shopify.$items.innerHTML = `<div class="${shopify.errorClass}">${message}</div>${shopify.$items.innerHTML}`;
        }
    }

    formatPrice = (money: MoneyV2): string => {
        const currency = money.currencyCode == 'EUR' ? '€' : money.currencyCode;
        return parseFloat(money.amount).toLocaleString(this.language || undefined, {minimumFractionDigits: 2}) + ' ' + currency;
    }
}
