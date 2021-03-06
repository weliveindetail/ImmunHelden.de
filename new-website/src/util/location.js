export function mapLocation(prev, doc) {
    const {
        title = "",
        latlng = {},
        address = "",
        phone = "",
        email = "",
        contact = "",
        id = "",
        partnerId = null,
    } = doc
    const { latitude, longitude } = latlng
    return [
        ...prev,
        {
            title,
            latitude,
            longitude,
            latlng,
            address,
            phone,
            email,
            contact,
            id,
            partnerId,
        },
    ]
}
