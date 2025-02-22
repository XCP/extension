import React, { useState, useRef, useEffect, FormEvent } from "react";
import { Field, Label, Description, Input, Textarea, Listbox, ListboxButton, ListboxOption, ListboxOptions, Disclosure } from "@headlessui/react";
import { FaChevronDown, FaCheck } from "react-icons/fa";
import { Button } from "@/components/button";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { FairminterOptions } from "@/utils/blockchain/counterparty";

const FAIRMINTER_MODELS = {
  MINER_FEE_ONLY: "MINER_FEE_ONLY",
  XCP_FEE_TO_ISSUER: "XCP_FEE_TO_ISSUER",
  XCP_FEE_BURNED: "XCP_FEE_BURNED",
} as const;

type FairminterModel = typeof FAIRMINTER_MODELS[keyof typeof FAIRMINTER_MODELS];

const FAIRMINTER_MODEL_OPTIONS = [
  { value: FAIRMINTER_MODELS.MINER_FEE_ONLY, label: "BTC Fee Model (Miners)" },
  { value: FAIRMINTER_MODELS.XCP_FEE_TO_ISSUER, label: "XCP Fee Model (To You)" },
  { value: FAIRMINTER_MODELS.XCP_FEE_BURNED, label: "XCP Fee Model (Burned)" },
];

interface FairminterFormDataInternal {
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
  sat_per_vbyte: number;
}

interface FairminterFormProps {
  onSubmit: (data: FairminterOptions) => void;
  initialFormData?: FairminterOptions;
  asset: string;
}

export function FairminterForm({ onSubmit, initialFormData, asset }: FairminterFormProps) {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText ?? false;

  const [formData, setFormData] = useState<FairminterFormDataInternal>(() => ({
    mintMethod: initialFormData?.burn_payment === false ? FAIRMINTER_MODELS.MINER_FEE_ONLY : (initialFormData?.burn_payment ? FAIRMINTER_MODELS.XCP_FEE_BURNED : FAIRMINTER_MODELS.XCP_FEE_TO_ISSUER),
    asset: initialFormData?.asset || (asset ? `${asset}.` : ""),
    price: initialFormData?.price?.toString() || "",
    quantity_by_price: initialFormData?.quantity_by_price?.toString() || "",
    max_mint_per_tx: initialFormData?.max_mint_per_tx?.toString() || "",
    hard_cap: initialFormData?.hard_cap?.toString() || "",
    premint_quantity: initialFormData?.premint_quantity?.toString() || "0",
    start_block: initialFormData?.start_block?.toString() || "",
    end_block: initialFormData?.end_block?.toString() || "",
    soft_cap: initialFormData?.soft_cap?.toString() || "",
    soft_cap_deadline_block: initialFormData?.soft_cap_deadline_block?.toString() || "",
    minted_asset_commission: initialFormData?.minted_asset_commission?.toString() || "0.0",
    lock_description: initialFormData?.lock_description || false,
    lock_quantity: initialFormData?.lock_quantity || false,
    divisible: initialFormData?.divisible ?? true,
    description: initialFormData?.description || "",
    sat_per_vbyte: initialFormData?.sat_per_vbyte || 1,
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  const assetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    assetInputRef.current?.focus();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.asset.trim()) {
      setLocalError("Asset name is required.");
      return;
    }
    if (formData.mintMethod === FAIRMINTER_MODELS.MINER_FEE_ONLY && (!formData.max_mint_per_tx || Number(formData.max_mint_per_tx) <= 0)) {
      setLocalError("Max mint per transaction is required for BTC Fee Model.");
      return;
    }
    if (formData.mintMethod !== FAIRMINTER_MODELS.MINER_FEE_ONLY && (!formData.price || Number(formData.price) <= 0)) {
      setLocalError("Price per mint is required for XCP Fee Models.");
      return;
    }
    if (formData.sat_per_vbyte <= 0) {
      setLocalError("Fee rate must be greater than zero.");
      return;
    }
    setLocalError(null);

    const submissionData: FairminterOptions = {
      sourceAddress: activeAddress?.address || "",
      asset: formData.asset,
      price: Number(formData.price) || 0,
      quantity_by_price: Number(formData.quantity_by_price) || 1,
      max_mint_per_tx: Number(formData.max_mint_per_tx) || 0,
      hard_cap: Number(formData.hard_cap) || 0,
      premint_quantity: Number(formData.premint_quantity) || 0,
      start_block: Number(formData.start_block) || 0,
      end_block: Number(formData.end_block) || 0,
      soft_cap: Number(formData.soft_cap) || 0,
      soft_cap_deadline_block: Number(formData.soft_cap_deadline_block) || 0,
      minted_asset_commission: Number(formData.minted_asset_commission) || 0,
      burn_payment: formData.mintMethod === FAIRMINTER_MODELS.XCP_FEE_BURNED,
      lock_description: formData.lock_description,
      lock_quantity: formData.lock_quantity,
      divisible: formData.divisible,
      description: formData.description,
      sat_per_vbyte: formData.sat_per_vbyte,
    };
    onSubmit(submissionData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4">
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field>
          <Label htmlFor="mintMethod" className="block text-sm font-medium text-gray-700">
            Mint Method <span className="text-red-500">*</span>
          </Label>
          <Listbox value={formData.mintMethod} onChange={(value) => setFormData((prev) => ({ ...prev, mintMethod: value }))}>
            <ListboxButton className="relative w-full p-2 text-left bg-gray-50 rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500">
              <span className="block truncate">
                {FAIRMINTER_MODEL_OPTIONS.find((option) => option.value === formData.mintMethod)?.label}
              </span>
              <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <FaChevronDown className="w-5 h-5 text-gray-500" aria-hidden="true" />
              </span>
            </ListboxButton>
            <ListboxOptions className="absolute w-full mt-1 overflow-auto bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none">
              {FAIRMINTER_MODEL_OPTIONS.map((option) => (
                <ListboxOption
                  key={option.value}
                  value={option.value}
                  className={({ focus }) => `${focus ? "text-white bg-blue-600" : "text-gray-900"} cursor-pointer select-none relative py-2 pl-3 pr-9`}
                >
                  {({ selected, focus }) => (
                    <>
                      <span className={`${selected ? "font-semibold" : "font-normal"} block truncate`}>
                        {option.label}
                      </span>
                      {selected && (
                        <span className={`${focus ? "text-white" : "text-blue-600"} absolute inset-y-0 right-0 flex items-center pr-4`}>
                          <FaCheck className="w-5 h-5" aria-hidden="true" />
                        </span>
                      )}
                    </>
                  )}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Listbox>
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Select the mint method for your fairminter.
          </Description>
        </Field>
        <Field>
          <Label htmlFor="asset" className="block text-sm font-medium text-gray-700">
            Asset Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="asset"
            name="asset"
            type="text"
            value={formData.asset}
            onChange={(e) => setFormData((prev) => ({ ...prev, asset: e.target.value.trim() }))}
            ref={assetInputRef}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
            required
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            The name of the asset to be minted.
          </Description>
        </Field>
        {formData.mintMethod === FAIRMINTER_MODELS.MINER_FEE_ONLY && (
          <Field>
            <Label htmlFor="max_mint_per_tx" className="block text-sm font-medium text-gray-700">
              Mint per TX <span className="text-red-500">*</span>
            </Label>
            <Input
              id="max_mint_per_tx"
              name="max_mint_per_tx"
              type="text"
              value={formData.max_mint_per_tx}
              onChange={(e) => setFormData((prev) => ({ ...prev, max_mint_per_tx: e.target.value }))}
              className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
              required
            />
            <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
              Maximum amount that can be minted in a single transaction.
            </Description>
          </Field>
        )}
        {formData.mintMethod !== FAIRMINTER_MODELS.MINER_FEE_ONLY && (
          <>
            <Field>
              <Label htmlFor="quantity_by_price" className="block text-sm font-medium text-gray-700">
                Get Per Mint
              </Label>
              <Input
                id="quantity_by_price"
                name="quantity_by_price"
                type="text"
                value={formData.quantity_by_price}
                onChange={(e) => setFormData((prev) => ({ ...prev, quantity_by_price: e.target.value }))}
                className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
              />
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                The quantity of asset minted per price unit.
              </Description>
            </Field>
            <Field>
              <Label htmlFor="price" className="block text-sm font-medium text-gray-700">
                Pay Per Mint <span className="text-red-500">*</span>
              </Label>
              <Input
                id="price"
                name="price"
                type="text"
                value={formData.price}
                onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                required
              />
              <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                The price in XCP per unit of the asset.
              </Description>
            </Field>
          </>
        )}
        <CheckboxInput
          checked={formData.divisible}
          onChange={(checked) => setFormData((prev) => ({ ...prev, divisible: checked }))}
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
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
            rows={2}
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            A textual description for the asset.
          </Description>
        </Field>
        <CheckboxInput
          checked={formData.lock_description}
          onChange={(checked) => setFormData((prev) => ({ ...prev, lock_description: checked }))}
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
            type="text"
            value={formData.hard_cap}
            onChange={(e) => setFormData((prev) => ({ ...prev, hard_cap: e.target.value }))}
            className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
          />
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Maximum total supply that can be minted.
          </Description>
        </Field>
        <CheckboxInput
          checked={formData.lock_quantity}
          onChange={(checked) => setFormData((prev) => ({ ...prev, lock_quantity: checked }))}
          label="Lock Quantity"
          aria-label="Toggle lock quantity"
        />
        <Disclosure>
          {({ open }) => (
            <>
              <Disclosure.Button className="flex items-center text-md font-semibold text-gray-700 hover:text-gray-900">
                <FaChevronDown className={`${open ? "transform rotate-180" : ""} w-4 h-4 mr-2 transition-transform`} />
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
                    type="text"
                    value={formData.start_block}
                    onChange={(e) => setFormData((prev) => ({ ...prev, start_block: e.target.value }))}
                    className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                  />
                  <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                    The block at which the sale starts.
                  </Description>
                </Field>
                <Field>
                  <Label htmlFor="end_block" className="block text-sm font-medium text-gray-700">
                    End Block
                  </Label>
                  <Input
                    id="end_block"
                    name="end_block"
                    type="text"
                    value={formData.end_block}
                    onChange={(e) => setFormData((prev) => ({ ...prev, end_block: e.target.value }))}
                    className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                  />
                  <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                    The block at which the sale ends.
                  </Description>
                </Field>
                <Field>
                  <Label htmlFor="premint_quantity" className="block text-sm font-medium text-gray-700">
                    Pre-mine
                  </Label>
                  <Input
                    id="premint_quantity"
                    name="premint_quantity"
                    type="text"
                    value={formData.premint_quantity}
                    onChange={(e) => setFormData((prev) => ({ ...prev, premint_quantity: e.target.value }))}
                    className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                  />
                  <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                    Amount of asset to mint when the sale starts.
                  </Description>
                </Field>
                <Field>
                  <Label htmlFor="minted_asset_commission" className="block text-sm font-medium text-gray-700">
                    Commission
                  </Label>
                  <Input
                    id="minted_asset_commission"
                    name="minted_asset_commission"
                    type="text"
                    value={formData.minted_asset_commission}
                    onChange={(e) => setFormData((prev) => ({ ...prev, minted_asset_commission: e.target.value }))}
                    className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                  />
                  <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                    Commission (fraction between 0 and less than 1) to be paid.
                  </Description>
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
                        type="text"
                        value={formData.soft_cap}
                        onChange={(e) => setFormData((prev) => ({ ...prev, soft_cap: e.target.value }))}
                        className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                      <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                        Minimum amount required for the sale to succeed.
                      </Description>
                    </Field>
                    <Field>
                      <Label htmlFor="soft_cap_deadline_block" className="block text-sm font-medium text-gray-700">
                        Soft Cap Deadline Block
                      </Label>
                      <Input
                        id="soft_cap_deadline_block"
                        name="soft_cap_deadline_block"
                        type="text"
                        value={formData.soft_cap_deadline_block}
                        onChange={(e) => setFormData((prev) => ({ ...prev, soft_cap_deadline_block: e.target.value }))}
                        className="mt-1 block w-full p-2 rounded-md border bg-gray-50 focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                      <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
                        The block by which the soft cap must be reached.
                      </Description>
                    </Field>
                  </>
                )}
              </Disclosure.Panel>
            </>
          )}
        </Disclosure>
        <FeeRateInput
          value={formData.sat_per_vbyte}
          onChange={(value) => setFormData((prev) => ({ ...prev, sat_per_vbyte: value }))}
          error={formData.sat_per_vbyte <= 0 ? "Fee rate must be greater than zero." : ""}
          showHelpText={shouldShowHelpText}
        />
        <Button type="submit" color="blue" fullWidth>
          Continue
        </Button>
      </form>
    </div>
  );
}
