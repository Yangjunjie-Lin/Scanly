#include "scanly/core.h"

#include <assert.h>
#include <stdint.h>
#include <string.h>

int main(void)
{
    assert(SCANLY_ABI_VERSION == 1);
    assert(SCANLY_CORE_ABI_VERSION == SCANLY_ABI_VERSION);
    scanly_context_options_t options;
    scanly_context_t *context = NULL;
    scanly_context_options_init(&options);
    options.backend = SCANLY_BACKEND_FIXTURE;
    assert(scanly_context_create(&options, &context) == SCANLY_STATUS_OK);
    assert(context != NULL);
    assert(strcmp(scanly_core_version(), "2.0.0-native-core.1") == 0);
    scanly_context_destroy(context);
    scanly_context_destroy(NULL);
    scanly_result_set_destroy(NULL);
    return 0;
}
