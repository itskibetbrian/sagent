package com.sagent.app.billing

import android.app.Activity
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class BillingModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val billingManager = BillingManager(
        context = reactContext,
        scope = moduleScope,
    )
    private val productCache = linkedMapOf<String, com.android.billingclient.api.ProductDetails>()
    private var hasListeners = false

    init {
        reactContext.addLifecycleEventListener(this)
        moduleScope.launch {
            try {
                billingManager.billingState.collectLatest { state ->
                    if (hasListeners) {
                        sendStateEvent(state)
                    }
                }
            } catch (e: Exception) {
                Log.e("[BillingModule]", "Collector error", e)
            }
        }
    }

    override fun getName(): String = "BillingModule"

    @ReactMethod
    fun initialize(promise: Promise) {
        moduleScope.launch {
            val result = billingManager.startConnection()
            result.fold(
                onSuccess = { promise.resolve(null) },
                onFailure = { error ->
                    val state = billingManager.billingState.value
                    val code = (state as? BillingState.Error)?.code ?: -1
                    promise.reject("BILLING_INIT_FAILED", error.message, billingErrorMap(error.message, code))
                }
            )
        }
    }

    @ReactMethod
    fun fetchSubscriptions(productIds: ReadableArray, promise: Promise) {
        val ids = buildList(productIds.size()) {
            for (index in 0 until productIds.size()) {
                productIds.getString(index)?.trim()?.takeIf { it.isNotEmpty() }?.let(::add)
            }
        }

        moduleScope.launch {
            val result = billingManager.fetchSubscriptions(ids)
            result.fold(
                onSuccess = { detailsList ->
                    productCache.clear()
                    detailsList.forEach { productCache[it.productId] = it }

                    val payload = Arguments.createArray()
                    detailsList.forEach { details ->
                        val detailMap = Arguments.createMap().apply {
                            putString("productId", details.productId)
                            putString("name", details.name)
                            putString("title", details.title)
                            putString("description", details.description)
                            putString("productType", details.productType)
                        }

                        val offersArray = Arguments.createArray()
                        details.subscriptionOfferDetails?.forEach { offer ->
                            val phase = offer.pricingPhases.pricingPhaseList.firstOrNull()
                            val offerMap = Arguments.createMap().apply {
                                putString("basePlanId", offer.basePlanId)
                                putString("offerId", offer.offerId)
                                putString("offerToken", offer.offerToken)
                                putString("formattedPrice", phase?.formattedPrice)
                                putString("billingPeriod", phase?.billingPeriod)
                                putDouble("priceAmountMicros", (phase?.priceAmountMicros ?: 0L).toDouble())
                                putString("priceCurrencyCode", phase?.priceCurrencyCode)
                                putInt("recurrenceMode", phase?.recurrenceMode ?: -1)
                            }
                            offersArray.pushMap(offerMap)
                        }

                        detailMap.putArray("offers", offersArray)
                        payload.pushMap(detailMap)
                    }
                    promise.resolve(payload)
                },
                onFailure = { error ->
                    val state = billingManager.billingState.value
                    val code = (state as? BillingState.Error)?.code ?: -1
                    promise.reject("BILLING_FETCH_FAILED", error.message, billingErrorMap(error.message, code))
                }
            )
        }
    }

    @ReactMethod
    fun launchPurchase(productId: String, offerToken: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity as? Activity
        if (activity == null) {
            promise.reject(
                "BILLING_NO_ACTIVITY",
                "An active Android activity is required to launch Google Play checkout."
            )
            return
        }

        val productDetails = productCache[productId]
        if (productDetails == null) {
            promise.reject(
                "BILLING_MISSING_PRODUCT",
                "Subscription details are not loaded for productId=$productId."
            )
            return
        }

        val result = billingManager.launchPurchase(activity, productDetails, offerToken)
        result.fold(
            onSuccess = { promise.resolve(null) },
            onFailure = { error ->
                val state = billingManager.billingState.value
                val code = (state as? BillingState.Error)?.code ?: -1
                promise.reject("BILLING_PURCHASE_FAILED", error.message, billingErrorMap(error.message, code))
            }
        )
    }

    @ReactMethod
    fun acknowledgePurchase(purchaseToken: String, promise: Promise) {
        moduleScope.launch {
            val result = billingManager.acknowledgePurchase(purchaseToken)
            result.fold(
                onSuccess = { promise.resolve(null) },
                onFailure = { error ->
                    val state = billingManager.billingState.value
                    val code = (state as? BillingState.Error)?.code ?: -1
                    promise.reject("BILLING_ACK_FAILED", error.message, billingErrorMap(error.message, code))
                }
            )
        }
    }

    @ReactMethod
    fun getCurrentState(promise: Promise) {
        promise.resolve(stateToWritableMap(billingManager.billingState.value))
    }

    @ReactMethod
    fun addListener(eventName: String) {
        hasListeners = true
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        if (count <= 0) return
        hasListeners = false
    }

    override fun onHostResume() = Unit

    override fun onHostPause() = Unit

    override fun onHostDestroy() {
        cleanup()
    }

    override fun invalidate() {
        super.invalidate()
        cleanup()
    }

    private fun cleanup() {
        reactApplicationContext.removeLifecycleEventListener(this)
        productCache.clear()
        moduleScope.cancel()
    }

    private fun sendStateEvent(state: BillingState) {
        try {
            val emitter = reactApplicationContext.getJSModule(
                DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
            )
            emitter?.emit(EVENT_STATE_CHANGED, stateToWritableMap(state))
        } catch (e: Exception) {
            Log.e("[BillingModule]", "Failed to send state event", e)
        }
    }

    private fun stateToWritableMap(state: BillingState) = Arguments.createMap().apply {
        when (state) {
            BillingState.Initializing -> {
                putString("status", "initializing")
            }
            BillingState.Ready -> {
                putString("status", "ready")
            }
            BillingState.Purchasing -> {
                putString("status", "purchasing")
            }
            is BillingState.Subscribed -> {
                putString("status", "subscribed")
                val purchasesArray = Arguments.createArray()
                state.purchases.forEach { purchase ->
                    val map = Arguments.createMap().apply {
                        putString("purchaseToken", purchase.purchaseToken)
                        putString("productId", purchase.productId)
                        putBoolean("isAcknowledged", purchase.isAcknowledged)
                    }
                    purchasesArray.pushMap(map)
                }
                putArray("purchases", purchasesArray)
            }
            is BillingState.Error -> {
                putString("status", "error")
                putString("message", state.message)
                putInt("code", state.code)
            }
        }
    }

    private fun billingErrorMap(message: String?, code: Int) = Arguments.createMap().apply {
        putString("message", message)
        putInt("code", code)
    }

    companion object {
        const val EVENT_STATE_CHANGED = "billingStateChanged"
    }
}
