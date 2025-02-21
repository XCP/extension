import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input, Textarea, Listbox, Disclosure } from "@headlessui/react";
import { FaChevronDown, FaCheck } from "react-icons/fa";
import { Button } from "@/components/button";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";

export interface FairminterFormData {
  mintMethod: FairminterModel;
  asset: string;
  price: string;
  quantity_by_price: string;
  max_mint_per_tx: string;
  hard_cap: string;
  premint_quantity: string;
  start_block: string;
  end_block: string;
  soft_cap: string;
  soft_cap_deadline_block: string;
  minted_asset_commission: string;
  lock_description: boolean;
  lock_quantity: boolean;
  divisible: boolean;
  description: string;

}

interface FairminterFormProps {
  asset: string;
  onSubmit: (data: any) => void;
  shouldShowHelpText: boolean;
}

const FAIRMINTER_MODELS = {
  MINER_FEE_ONLY: "MINER_FEE_ONLY",
  XCP_FEE_TO_ISSUER: "XCP_FEE_TO_ISSUER",
  XCP_FEE_BURNED: "XCP_FEE_BURNED",
} as const;

export type FairminterModel = typeof FAIRMINTER_MODELS[keyof typeof FAIRMINTER_MODELS];

const FAIRMINTER_MODEL_OPTIONS = [
  { value: FAIRMINTER_MODELS.MINER_FEE_ONLY, label: "BTC Fee Model (Miners)" },
  { value: FAIRMINTER_MODELS.XCP_FEE_TO_ISSUER, label: "XCP Fee Model (To You)" },
  { value: FAIRMINTER_MODELS.XCP_FEE_BURNED, label: "XCP Fee Model (Burned)" },
];

const FairminterForm = ({ asset, onSubmit, shouldShowHelpText }: FairminterFormProps) => {
  const [formData, setFormData] = useState<FairminterFormData>({
    mintMethod: FAIRMINTER_MODELS.MINER_FEE_ONLY,
    asset: asset ? `${asset}.` : "",
    price: "",
    quantity_by_price: "",
    max_mint_per_tx: "",
    hard_cap: "",
    premint_quantity: "0",
    start_block: "",
    end_block: "",
    soft_cap: "",
    soft_cap_deadline_block: "",
    minted_asset_commission: "0.0",
    lock_description: false,
    lock_quantity: false,
    divisible: true,
    description: "",

  });

  const assetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    assetInputRef.current?.focus();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (name: keyof FairminterFormData, checked: boolean) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleMintMethodChange = (value: FairminterModel) => {
    setFormData((prev) => ({ ...prev, mintMethod: value }));
  };

  const handleSubmitInternal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (formData.feeRateSatPerVByte <= 0) {
      return; // Validation handled by FeeRateInput
    }
    onSubmit(formData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      <form onSubmit={handleSubmitInternal} className="space-y-4">
        <Field>
          <Label htmlFor="mintMethod" className="block text-sm font-medium text-gray-700">
            Mint Method<span className="text-red-500">*</span>
          </Label>
          <Listbox value={formData.mintMethod} onChange={handleMintMethodChange}>
            <div className="relative mt-1">
              <Listbox.Button className="relative w-full p-2 text-left bg-gray-50 rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500">
                <span className="block truncate">
                  {FAIRMINTER_MODEL_OPTIONS.find((option) => option.value === formData.mintMethod)?.label}
                </span>
                <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <FaChevronDown className="w-5 h-5 text-gray-500" aria-hidden="true" />
                </span>
              </Listbox.Button>
              <Listbox.Options className="absolute w-full mt-1 overflow-auto bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none">
                {FAIRMINTER_MODEL_OPTIONS.map((option) => (
                  <Listbox.Option
                    key={option.value}
                    value={option.value}
                    className={({ active }) =>
                      `${active ? "text-white bg-blue-600" : "text-gray-900"} cursor-pointer select-none relative py-2 pl-3 pr-9`
                    }
                  >
                    {({ selected, active }) => (
                      <>
                        <span
                          className={`${selected ? "font-semibold" : "font-normal"} block truncate`}
                        >
                          {option.label}
                        </span>
                        {selected && (
                          <span
                            className={`${active ? "text-white" : "text-blue-600"} absolute inset-y-0 right-0 flex items-center pr-4`}
                          >
                            <FaCheck className="w-5 h-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </div>
          </Listbox>
          {shouldShowHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              Select the mint method for your fairminter.
            </Description>
          )}
        </Field>

        <Field>
          <Label htmlFor="asset" className="block text-sm font-medium text-gray-700">
            Asset Name<span className="text-red-500">*</span>
          </Label>
          <Input
            id="asset"
            name="asset"
            type="text"
            value={formData.asset}
            onChange={handleInputChange}
            ref={assetInputRef}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
            required
          />
          {shouldShowHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              The name of the asset to be minted.
            </Description>
          )}
        </Field>

        {formData.mintMethod === FAIRMINTER_MODELS.MINER_FEE_ONLY && (
          <Field>
            <Label htmlFor="max_mint_per_tx" className="block text-sm font-medium text-gray-700">
              Mint per TX<span className="text-red-500">*</span>
            </Label>
            <Input
              id="max_mint_per_tx"
              name="max_mint_per_tx"
              type="number"
              value={formData.max_mint_per_tx}
              onChange={handleInputChange}
              min="1"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
              required
            />
            {shouldShowHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                Maximum amount that can be minted in a single transaction.
              </Description>
            )}
          </Field>
        )}

        {formData.mintMethod !== FAIRMINTER_MODELS.MINER_FEE_ONLY && (
          <Field>
            <Label htmlFor="quantity_by_price" className="block text-sm font-medium text-gray-700">
              Get Per Mint
            </Label>
            <Input
              id="quantity_by_price"
              name="quantity_by_price"
              type="number"
              value={formData.quantity_by_price}
              onChange={handleInputChange}
              min="1"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
            />
            {shouldShowHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                The quantity of asset minted per price unit.
              </Description>
            )}
          </Field>
        )}

        {formData.mintMethod !== FAIRMINTER_MODELS.MINER_FEE_ONLY && (
          <Field>
            <Label htmlFor="price" className="block text-sm font-medium text-gray-700">
              Pay Per Mint<span className="text-red-500">*</span>
            </Label>
            <Input
              id="price"
              name="price"
              type="number"
              value={formData.price}
              onChange={handleInputChange}
              min="1"
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
              required
            />
            {shouldShowHelpText && (
              <Description className="mt-2 text-sm text-gray-500">
                The price in XCP per unit of the asset.
              </Description>
            )}
          </Field>
        )}

        <CheckboxInput
          checked={formData.divisible}
          onChange={(checked) => handleCheckboxChange("divisible", checked)}
          label="Divisible"
          aria-label="Toggle asset divisibility"
        />

        <Field>
          <Label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description
          </Label>
          <Textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
            rows={2}
          />
          {shouldShowHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              A textual description for the asset.
            </Description>
          )}
        </Field>

        <CheckboxInput
          checked={formData.lock_description}
          onChange={(checked) => handleCheckboxChange("lock_description", checked)}
          label="Lock Description"
          aria-label="Toggle lock description"
        />

        <Field>
          <Label htmlFor="hard_cap" className="block text-sm font-medium text-gray-700">
            Hard Cap
          </Label>
          <Input
            id="hard_cap"
            name="hard_cap"
            type="number"
            value={formData.hard_cap}
            onChange={handleInputChange}
            min="0"
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
          />
          {shouldShowHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              Maximum total supply that can be minted.
            </Description>
          )}
        </Field>

        <CheckboxInput
          checked={formData.lock_quantity}
          onChange={(checked) => handleCheckboxChange("lock_quantity", checked)}
          label="Lock Quantity"
          aria-label="Toggle lock quantity"
        />

        <Disclosure>
          {({ open }) => (
            <>
              <Disclosure.Button className="flex items-center text-md font-semibold text-gray-700 hover:text-gray-900">
                <FaChevronDown
                  className={`${open ? "transform rotate-180" : ""} w-4 h-4 mr-2 transition-transform`}
                />
                Advanced Options
              </Disclosure.Button>
              <Disclosure.Panel className="mt-2 space-y-4">
                <Field>
                  <Label htmlFor="start_block" className="block text-sm font-medium text-gray-700">
                    Start Block
                  </Label>
                  <Input
                    id="start_block"
                    name="start_block"
                    type="number"
                    value={formData.start_block}
                    onChange={handleInputChange}
                    min="0"
                    className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                  />
                  {shouldShowHelpText && (
                    <Description className="mt-2 text-sm text-gray-500">
                      The block at which the sale starts.
                    </Description>
                  )}
                </Field>

                <Field>
                  <Label htmlFor="end_block" className="block text-sm font-medium text-gray-700">
                    End Block
                  </Label>
                  <Input
                    id="end_block"
                    name="end_block"
                    type="number"
                    value={formData.end_block}
                    onChange={handleInputChange}
                    min="0"
                    className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                  />
                  {shouldShowHelpText && (
                    <Description className="mt-2 text-sm text-gray-500">
                      The block at which the sale ends.
                    </Description>
                  )}
                </Field>

                <Field>
                  <Label htmlFor="premint_quantity" className="block text-sm font-medium text-gray-700">
                    Pre-mine
                  </Label>
                  <Input
                    id="premint_quantity"
                    name="premint_quantity"
                    type="number"
                    value={formData.premint_quantity}
                    onChange={handleInputChange}
                    min="0"
                    className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                  />
                  {shouldShowHelpText && (
                    <Description className="mt-2 text-sm text-gray-500">
                      Amount of asset to mint when the sale starts.
                    </Description>
                  )}
                </Field>

                <Field>
                  <Label
                    htmlFor="minted_asset_commission"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Commission
                  </Label>
                  <Input
                    id="minted_asset_commission"
                    name="minted_asset_commission"
                    type="number"
                    step="0.01"
                    min="0"
                    max="0.9999"
                    value={formData.minted_asset_commission}
                    onChange={handleInputChange}
                    className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                  />
                  {shouldShowHelpText && (
                    <Description className="mt-2 text-sm text-gray-500">
                      Commission (fraction between 0 and less than 1) to be paid.
                    </Description>
                  )}
                </Field>

                {formData.mintMethod !== FAIRMINTER_MODELS.MINER_FEE_ONLY && (
                  <>
                    <Field>
                      <Label htmlFor="soft_cap" className="block text-sm font-medium text-gray-700">
                        Soft Cap
                      </Label>
                      <Input
                        id="soft_cap"
                        name="soft_cap"
                        type="number"
                        value={formData.soft_cap}
                        onChange={handleInputChange}
                        min="0"
                        className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                      {shouldShowHelpText && (
                        <Description className="mt-2 text-sm text-gray-500">
                          Minimum amount required for the sale to succeed.
                        </Description>
                      )}
                    </Field>
                    <Field>
                      <Label
                        htmlFor="soft_cap_deadline_block"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Soft Cap Deadline Block
                      </Label>
                      <Input
                        id="soft_cap_deadline_block"
                        name="soft_cap_deadline_block"
                        type="number"
                        value={formData.soft_cap_deadline_block}
                        onChange={handleInputChange}
                        min="0"
                        className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                      {shouldShowHelpText && (
                        <Description className="mt-2 text-sm text-gray-500">
                          The block by which the soft cap must be reached.
                        </Description>
                      )}
                    </Field>
                  </>
                )}
              </Disclosure.Panel>
            </>
          )}
        </Disclosure>

        <FeeRateInput
          value={formData.feeRateSatPerVByte}
          onChange={(value) => setFormData((prev) => ({ ...prev, feeRateSatPerVByte: value }))}
          error={formData.feeRateSatPerVByte <= 0 ? "Fee rate must be greater than zero." : ""}
          showHelpText={shouldShowHelpText}
        />

        <Button
          type="submit"
          color="blue"
          fullWidth
          disabled={!formData.asset.trim() || formData.feeRateSatPerVByte <= 0}
        >
          Continue
        </Button>
      </form>
    </div>
  );
};

export { FairminterForm };
